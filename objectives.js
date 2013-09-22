// List of objectives
var objectives = new Array(
// Pickup 15 Gems
{
	name: 'Pickup 15 gems',
	reward: '+1 stats / gem',
	init: function(obj) {
		// Make sure name matches
		var itemTotal = 15;	// Total number of items to spawn
		
		// Valid regions to spawn in
		var poses = new Array({
			x1: -6436,
			y1: 6086,
			
			x2: 2170,
			y2: -2572
		}, {
			x1: 5963,
			y1: -6030,
			
			x2: -3010,
			y2: -1426
		});
		
		// Spawn all gems
		obj.poses = new Array();
		for(var i=0; i<itemTotal;i++) {
			// Grab a pos range
			var pos = getRandomArray(poses);
			
			// Pick a position for it
			var xp = randomFromInterval(pos.x1, pos.x2);
			var yp = randomFromInterval(pos.y1, pos.y2);
			
			// Spawn an item into a random position
			var item = dota.createItemDrop(DIRE_ANCIENT, 'item_gem', xp, yp, 256);
			
			// Grab the position is actually spawned at
			var itemPos = item.netprops.m_vecOrigin;
			
			// Store where it spawned
			obj.poses.push({
				x: itemPos.x,
				y: itemPos.y,
				z: itemPos.z
			});
		}
		
		// Store how many are left
		obj.totalRemaining = itemTotal;
	},
	gameFrame: function(obj) {
		// Cycle all clients
		for(var i=0;i<server.clients.length;i++) {
			var client = server.clients[i];
			if(!client) continue;
			
			// Cycle all heroes of this client
			var heroes = client.getHeroes();
			for(var hh in heroes) {
				var hero = heroes[hh];
				if(!hero || !hero.isValid()) continue;
				
				// Cycle all items of this hero
				for(var j=0;j<14;j++) {
					var itemSlot = hero.netprops.m_hItems[j];
					if(itemSlot) {
						if(itemSlot.netprops.m_hPurchaser == DIRE_ANCIENT) {
							// Delete the item
							dota.remove(itemSlot);
							
							// Grab the client's team
							var team = client.netprops.m_iTeamNum;
							
							// Check if it was a zombie that picked it up
							if(team == dota.TEAM_DIRE) {
								// Grab hero's position
								var heroPos = hero.netprops.m_vecOrigin;
								var realPos = heroPos;
								
								// Find closest spawn point
								var maxDist = 1000000;
								for(var key in obj.poses) {
									var dist = vecDist(heroPos, obj.poses[key]);
									
									if(dist < maxDist) {
										maxDist = dist;
										realPos = obj.poses[key];
									}
								}
								
								// Respawn the item
								dota.createItemDrop(DIRE_ANCIENT, 'item_gem', realPos);
								
								// Tell this client they aren't allowed to pick it up
								client.printToChat('You can\'t pickup human items.');
							}else {
								// Remove one
								obj.totalRemaining -= 1;
								
								// Check if we've found all gems
								if(obj.totalRemaining == 0) {
									obj.completed = true;
								}
								
								// Tell all clients
								for(var i=0;i<server.clients.length;i++) {
									var c = server.clients[i];
									if(!c || !c.isInGame()) continue;
									
									// Print message
									c.printToChat('A gem was found! +1 stats to all humans!');
									
									// Make sure this client isn't a zombie
									var playerID = c.netprops.m_iPlayerID;
									if(!isZombie[playerID]) {
										// Give stats
										var heroes = c.getHeroes();
										
										// Grab each hero of the client
										for(var hh in heroes) {
											var hero = heroes[hh];
											
											// Add stats
											hero.netprops.m_flStrength += 1;
											hero.netprops.m_flAgility += 1;
											hero.netprops.m_flIntellect += 1;
										}
									}
									
									// Check if we've completed the objective
									if(obj.completed) {
										c.printToChat('All gems have been found! Objective complete!');
									}
								}
								
							}
						} 
					}
				}
			}
		}
	}
},
// Survive X minutes
{
	name: 'Survive 10 minutes',
	reward: '+5 stats / 2 minutes',
	init: function(obj) {
		obj.once = false;
	},
	gameFrame: function(obj) {
		if(!obj.once && game.rules.props.m_nGameState == dota.STATE_GAME_IN_PROGRESS) {
			obj.once = true;
			
			// Add a timer for every 2 minutes
			for(var i=2; i<=10; i += 2) {
				timers.setTimeout(function() {
					for(var i=0;i<server.clients.length;i++) {
						var c = server.clients[i];
						if(!c || !c.isInGame()) continue;
						
						// Print message
						c.printToChat('The humans have survived another 2 minutes! +5 stats to all humans!');
						
						// Make sure this client isn't a zombie
						var playerID = c.netprops.m_iPlayerID;
						if(!isZombie[playerID]) {
							// Give stats
							var heroes = c.getHeroes();
							
							// Grab each hero of the client
							for(var hh in heroes) {
								var hero = heroes[hh];
								
								// Add stats
								hero.netprops.m_flStrength += 5;
								hero.netprops.m_flAgility += 5;
								hero.netprops.m_flIntellect += 5;
							}
						}
					}
				}, i * 60 * 1000);
			}
			
			// This objective is now completed!
			timers.setTimeout(function() {
				obj.completed = true;
			}, 10 * 60 * 1000);
		}
	}
},

// Hold the rosh pit for 60 seconds
{
	name: 'Hold the Rosh Pit for 60 seconds',
	reward: '+15 stats',
	init: function(obj) {
		obj.inside = false;
		
		// Middle of the pit
		obj.insidePos = {
			x:2505,
			y: -391,
			z: 4
		}
		
		// Distance from this point for it to count
		obj.insideDist = 500;
	},
	gameFrame: function(obj) {
		var gameTime = game.rules.props.m_fGameTime;
		var someoneInside = false;
		
		loop1:
		for(var i=0;i<server.clients.length;i++) {
			var c = server.clients[i];
			if(!c || !c.isInGame()) continue;
			
			// Make sure this client isn't a zombie
			var playerID = c.netprops.m_iPlayerID;
			if(!isZombie[playerID]) {
				// Give stats
				var heroes = c.getHeroes();
				
				// Grab each hero of the client
				for(var hh in heroes) {
					var hero = heroes[hh];
					
					if(vecDist(hero.netprops.m_vecOrigin, obj.insidePos) < obj.insideDist) {
						someoneInside = true;
						break loop1;
					}
				}
			}
		}
		
		if(!obj.inside) {	
			if(someoneInside) {
				// Store that someone is inside
				obj.inside = true;
				obj.finishTime = gameTime + 60;
				
				// Tell everyone about this challenge
				for(var i=0;i<server.clients.length;i++) {
					var c = server.clients[i];
					if(!c || !c.isInGame()) continue;
					
					// Print message
					c.printToChat('A human has entered the Rosh Pit! Hold it for 60 seconds for a reward!');
				}
			}
		} else {
			if(!someoneInside) {
				// Store that no one is in the pit
				obj.inside = false;
				
				// Tell everyone about this challenge
				for(var i=0;i<server.clients.length;i++) {
					var c = server.clients[i];
					if(!c || !c.isInGame()) continue;
					
					// Print message
					c.printToChat('No humans are left in the Rosh Pit, the 60 seconds has reset!');
				}
				
				return;
			}
			
			// Check if the time is up yet
			if(gameTime > obj.finishTime) {
				// Store that this challenge is completed
				obj.completed = true;
				
				// Tell everyone about this challenge
				for(var i=0;i<server.clients.length;i++) {
					var c = server.clients[i];
					if(!c || !c.isInGame()) continue;
					
					// Print message
					c.printToChat('The humans have held the Roshan pit for 60 seconds! +15 stats for all humans!');
					
					// Make sure this client isn't a zombie
					var playerID = c.netprops.m_iPlayerID;
					if(!isZombie[playerID]) {
						// Give stats
						var heroes = c.getHeroes();
						
						// Grab each hero of the client
						for(var hh in heroes) {
							var hero = heroes[hh];
							
							// Add stats
							hero.netprops.m_flStrength += 15;
							hero.netprops.m_flAgility += 15;
							hero.netprops.m_flIntellect += 15;
						}
					}
				}
			}
		}
	}
}
);

// Hook functions
game.hook('OnMapStart', onMapStart);
game.hook("OnGameFrame", onGameFrame);

// Add command to access objectives
console.addClientCommand('o', CmdO);

// Command to access objectives
function CmdO(client, args) {
	if(!client) return;
	
	for(var i=0; i<objectives.length;i++) {
		// Grab the objective
		var o = objectives[i];
		
		// Make sure it's not done already
		if(!o.completed) {
			// Create friendly number
			var n = i+1;
			if(n < 10) {
				n = '0'+n;
			}
			
			// Tell the client about it
			client.printToChat('['+n+'] '+o.name+' ['+o.reward+']');
		}
	}
}

function onMapStart() {
	// Init all objectivies
	for(var i=0; i<objectives.length;i++) {
		// Grab the objective
		var o = objectives[i];
		
		// Check if it has an init function
		if(o.init) {
			o.init(o);
		}
	}
}

function onGameFrame() {
	// Init all objectivies
	for(var i=0; i<objectives.length;i++) {
		// Grab the objective
		var o = objectives[i];
		
		// Check if it has an init function
		if(!o.completed && o.gameFrame) {
			o.gameFrame(o);
		}
	}
}

function getRandomArray(ar) {
	return ar[Math.floor(Math.random()*ar.length)];
}

function randomFromInterval(from,to) {
	// Make sure from < to
	if(to < from) {
		var t = to;
		to = from;
		from = t;
	}
	
	// Pick a number in this range
    return Math.floor(Math.random()*(to-from+1)+from);
}

// Calculates the distance between two vectors (not taking into account for z)
function vecDist(vec1, vec2) {
	if(!vec1 || !vec2) return 1000000;
	
	var xx = (vec1.x - vec2.x);
	var yy = (vec1.y - vec2.y);
	
	return Math.sqrt(xx*xx + yy*yy);
}

// Some useful dev commands for singleplayer
if(singlePlayer) {
	console.addClientCommand('pos', function(client, args) {
		var heroes = client.getHeroes();
		
		for(var hh in heroes) {
			var hero = heroes[hh];
			
			server.print(hero.netprops.m_vecOrigin);
		}
	});

	console.addClientCommand('p', function(client, args) {
		var o = objectives[0];
		
		var i = parseInt(args[0]) || 0;
		
		var pos = o.poses[i];
		dota.pingLocation(client, 0, 0, true, 0, pos);
	});
	
	console.addClientCommand('aegis', function(client, args) {
		
		// Grab list of heroes
		var heroes = client.getHeroes();
		
		for(var hh in heroes) {
			var hero = heroes[hh];
			
			dota.giveItemToHero('item_aegis', hero)
		}
	});
}
