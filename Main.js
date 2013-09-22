/*
Singleplayer Mode

Turn this on if you want to test by yourself, and turn
	singleplayer bots on if you'd like some bots to play with (they just stand there)

NOTE: The icons at the top don't show the correct teams
*/

var singlePlayer = false;
var addSinglePlayerBots = false;
var spawnAsZombie = false;			// Do you want to spawn as the zombie?
var forceZombieID = -1;				// Which player to force as a zombie

// Grab libraries
var timers = require('timers');

// Hook stuff
game.hook('OnMapStart', onMapStart);
game.hook("Dota_OnHeroPicked", onHeroPicked);
game.hook("Dota_OnHeroSpawn", onHeroSpawn);
game.hook("Dota_OnBuyItem", onBuyItem);
game.hook("OnGameFrame", onGameFrame);
game.hook("Dota_OnUnitParsed", onUnitParsed);
game.hook("OnClientDisconnect", onClientDisconnect);
game.hook("OnClientPutInServer", onClientPutInServer);

// Hook events
game.hookEvent("entity_hurt", onEntityHurt);
game.hookEvent("dota_player_gained_level", onPlayerGainedLevel);

// Add console commands
console.addClientCommand('zombie', CmdZombie);
console.addClientCommand('z', CmdZ);

// Store mid towers on dire team
var tower1, tower2, tower3;

// CV we need to force mid only (taken from mid only gamemode)
var cvForceGameMode = console.findConVar("dota_force_gamemode");

// To look at gold etc
var playerManager;

// Stuff we need to store who can be / is the zombie
var zombieID = -1;
var isZombie = {};
var isInfected = {};
var wantsToBeInfected = new Array();
var isAlphaZombie = {};

// List of people who have seen -o
var objectiveShownTo = {};

var totalSpawnInfected = 1;

// Stores player's original teams
var originalTeam = {};

// Stores if we've told this player how to play
var toldPlayers = {};

// We need to store radiants ancient
var DIRE_ANCIENT;
var RADIANT_ANCIENT;

var ZOMBIE_INFECT_DELAY = 60;	// Delay before infection takes someone over (in seconds)

// Load objectives
require('objectives.js');

// Extra gold taken from EasyMode
var goldTimer;
var goldOnce = false;

// Spawn bots if in single player
if(singlePlayer && addSinglePlayerBots) {
	game.hook("OnGameFrame", onGameFrameBots);
	var cvAddBots = console.findConVar("dota_fill_empty_slots_with_bots");
	
	function onGameFrameBots() {
		if ( game.rules.props.m_nGameState == dota.STATE_INIT ) {
			cvAddBots.setBool( true );
		}
	}
}

plugin.get('LobbyManager', function(obj){
	// Grab options
	var option = obj.getOptionsForPlugin("Infection")["Rate"];
	
	// Ensure we can find the lobby manager
	if(option) {
		// Update gold per second
		totalSpawnInfected = parseInt(option);
		
		if(totalSpawnInfected <= 0) {
			totalSpawnInfected = 1;
		}
	}
});

function onMapStart() {
	// Store dire's ancient
	DIRE_ANCIENT = game.findEntityByTargetname('dota_badguys_fort');
	RADIANT_ANCIENT = game.findEntityByTargetname('dota_goodguys_fort');
	
	// Add bloodlust to the ancient
	DIRE_ANCIENT.trueSight = dota.createAbility(DIRE_ANCIENT, 'bloodseeker_thirst');
	
	// Stop undying from being picked
	dota.setHeroAvailable(85 , false);
	
	// Precache particles + models needed for the zombies
	dota.loadParticleFile('particles/units/heroes/hero_mirana.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_undying.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_broodmother.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_meepo.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_furion.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_antimage.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_tusk.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_magnataur.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_morphling.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_faceless_void.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_faceless_void.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_riki.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_slark.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_dragon_knight.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_crystalmaiden.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_pudge.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_life_stealer.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_alchemist.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_bristleback.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_centaur.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_furion.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_treant.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_kunkka.pcf');
	
	game.precacheModel('models/heroes/undying/undying_flesh_golem.mdl');
	game.precacheModel('models/heroes/undying/undying_minion.mdl');
	game.precacheModel('models/heroes/undying/undying_minion_torso.mdl');
	game.precacheModel('models/heroes/undying/undying_tower.mdl');
	game.precacheModel('models/heroes/furion/treant.mdl');
	
	// Grab the player manager
	playerManager = game.findEntityByClassname(-1, "dota_player_manager");
	
	if(playerManager == null) {
		server.print('\n\nFAILED TO FIND RESOURCE HANDLE\n\n');
	}
	
	// Print warning to console
	if(singlePlayer) {
		server.print('===\n\n\nWARNING: Singleplayer mode is active!\n\n\n===');
	}
	
	// Grab towers
	tower1 = game.findEntityByTargetname('dota_badguys_tower1_mid');
	tower2 = game.findEntityByTargetname('dota_badguys_tower2_mid');
	tower3 = game.findEntityByTargetname('dota_badguys_tower3_mid');
	
	// Validate towers
	if(!tower1 || !tower2 || !tower3) {
		server.print('FAILED TO FIND TOWERS!');
	}
	
	// Create couriers
	var courier = dota.createUnit('npc_dota_courier', dota.TEAM_RADIANT);
	dota.findClearSpaceForUnit(courier, -7271, -6713, 270);
	
	var courier = dota.createUnit('npc_dota_courier', dota.TEAM_DIRE);
	dota.findClearSpaceForUnit(courier, 7031, 6427, 263);
}

function onHeroSpawn(hero) {
	// Grab playerID
	var playerID = hero.netprops.m_iPlayerID;
	
	// Grab client
	var client = dota.findClientByPlayerID(playerID);
	if(!client) return;
	
	// Gold patch
	goldPatch(client);
	
	// Check if this person is a zombie
	if(isZombie[playerID]) {
		// Make this person into a zombie
		becomeZombie(hero);
		
		// Teleport the hero on the next frame, if we didn't wait until the next frame,
		//    dota would teleport them back to the fountain :(
		timers.setTimeout(function() {
			// Check if the tower is still valid
			if(tower1) {
				dota.findClearSpaceForUnit(hero, tower2.netprops.m_vecOrigin);
			}else if(tower2) {
				dota.findClearSpaceForUnit(hero, tower3.netprops.m_vecOrigin);
			}
		}, 1);
		
		// Tell them about alpha zombie perks
		if(isAlphaZombie[playerID]) {
			client.printToChat('You are the Alpha Zombie. You can buy items and have bonus stats.');
		}
	} else {
		// Make this person human
		becomeHuman(client);
		
		// Give zombies truesight to this hero
		trueSight(hero);
		
		// Check if this player is infected
		if(isInfected[playerID]) {
			// Tell the client what's going on
			client.printToChat('You will turn into a zombie in '+ZOMBIE_INFECT_DELAY+' seconds!');
			
			// Add a warning timer
			timers.setTimeout(function() {
				// Make sure they haven't changed into a zombie already
				if(!isZombie[playerID]) {
					client.printToChat('You are about to change into a zombie!!!');
				}
			}, 1000 * (ZOMBIE_INFECT_DELAY - 3));
			
			// Add the timer to change them!
			timers.setTimeout(function() {
				// Make sure they haven't turned already
				if(!isZombie[playerID]) {
					// Become a zombie!
					becomeZombie(hero);
				}
			}, 1000 * (ZOMBIE_INFECT_DELAY));
			
			// This player is no longer infected
			isInfected[playerID] = false;
			
			// Store that we dont need to show the objective shit
			objectiveShownTo[playerID] = true;
		} else {
			// Check if they've already seen it
			if(!objectiveShownTo[playerID]) {
				// Remind them about the objectives
				client.printToChat('TIP: Type -o for a list of objectives to complete as a human.');
				
				// Store that we've seen it now
				objectiveShownTo[playerID] = true;
			}
		}
	}
}

function onHeroPicked(client, heroName){
	// Put them onto radiant
	becomeRadiant(client);
	
	// Check if there is already a zombie
	if(zombieID == -1) {
		while(totalSpawnInfected > 0) {
			// One less zombie we need to spawn infected
			totalSpawnInfected -= 1;
			
			// Used to store possible zombies
			var possibleZombies = new Array();
			
			// check if anyone _wants_ to be infected
			if(wantsToBeInfected.length > 0) {
				// These are the possible zombies
				possibleZombies = wantsToBeInfected;
			} else {
				// Build list of possible zombies
				for(var i=0;i<server.clients.length;i++) {
					// Grab client
					var client2 = server.clients[i];
					if(!client2) continue;
					
					// Make sure this client has a playerID
					var playerID = client2.netprops.m_iPlayerID;
					if(playerID == -1) continue;
					
					// Make sure this person isn't already infected
					if(isInfected[playerID] != null) continue;
					
					// This is a possible zombie
					possibleZombies.push(client2.netprops.m_iPlayerID);
				}
			}
			
			// Pick a zombie
			zombieID = possibleZombies[Math.floor((Math.random()*possibleZombies.length))];
			
			// Change the zombie to player0 if that dev option is selected
			if(singlePlayer && spawnAsZombie) {
				zombieID = 0;
			}
			
			// Only spawn them as a zombie if it isn't single player mode
			if(!singlePlayer || spawnAsZombie) {
				// Store that this client is a zombie
				isInfected[zombieID] = true;
				
				// Make this player into an alpha zombie
				isAlphaZombie[zombieID] = true;
				
				// Tell them they are infected
				var c = dota.findClientByPlayerID(zombieID);
				if(c) {
					c.printToChat('You\'ve been infected with a DEADLY virus and will turn into a zombie!');
					c.printToChat('Try to stand near someone so you can eat their brains, or run back towards the dire base so you don\'t feed the humans!');
					c.printToChat('Type -zombie to change instantly!');
				}
			}
			
			// Grab the client that corosponds to this zombie
			var zombie = dota.findClientByPlayerID(zombieID);
			
			if(zombie == null) {
				// Shit is broken!! (mostly here for dev reasons)
				server.print('\n\nZOMBIE GAMEMODE IS BROKEN!\n\n');
				return;
			}
		}
	}
	
	// Grab their playerID
	var playerID = client.netprops.m_iPlayerID;
	if(playerID != -1) {
		if(isInfected[playerID] == null && !toldPlayers[playerID]) {
			// Store that we've told them
			toldPlayers[playerID] = true;
			
			// Tell them
			client.printToChat('CAREFUL: If you die, you will become a zombie!');
			client.printToChat('TIP: Type -o for a list of objectives to complete as a human.');
		}
	}
	
	// No one is allowed to pick undying
	if(heroName == 'npc_dota_hero_undying') {
		return null;
	}
}

function onBuyItem(ent, item, playerID, unknown) {
	// Grab client
	var client = dota.findClientByPlayerID(playerID);
	if(!client) return;
	
	var playerID = client.netprops.m_iPlayerID;
	if(playerID == -1) return false;
	
	// Stop zombies from buying items
	if(isZombie[playerID] && !isAlphaZombie[playerID]) {
		return false;
	}
}

// Force mid only
function onGameFrame(){
	cvForceGameMode.setInt(11);
	
	var gameTime = game.rules.props.m_fGameTime;
	if (!goldOnce && game.rules.props.m_nGameState == dota.STATE_GAME_IN_PROGRESS) {
		goldOnce = true;
		goldTimer = game.rules.props.m_fGameTime;
	}
	
	if (gameTime >= goldTimer) {
		goldTimer += 1;
		
		var totalZombies = 0;
		var totalHumans = 0;
		
		for (var i = 0; i < server.clients.length; ++i) {
			var client = server.clients[i];
			if (!client || !client.isInGame()) continue;
			
			var playerID = client.netprops.m_iPlayerID;
			if(playerID == -1) continue;
			
			if(isZombie[playerID]) {
				totalZombies += 1;
			} else {
				totalHumans += 1;
			}
		}
		
		// Check if zombies outnumber humans
		var ratio = totalZombies - totalHumans + 9;
		if(ratio < 0) return;
		
		// Change the ratio
		ratio *= 2;
		
		// Give gold
		for (var i = 0; i < server.clients.length; ++i) {
			var client = server.clients[i];
			if (!client || !client.isInGame()) continue;
			
			var playerID = client.netprops.m_iPlayerID;
			if(playerID == -1) continue;
			
			// Make sure they aren't a zombie
			if(!isZombie[playerID]) {
				giveGold(playerID, ratio);
			}
		}
	}
}

function onUnitParsed(unit, keyvalues){
	// Make roshan into a zombie
	if(unit.getClassname() == 'npc_dota_roshan') {
		keyvalues['model'] = 'models/heroes/undying/undying_flesh_golem.mdl';
	}
	
	// Check if it is one of our units
	if(	unit.getClassname() == 'npc_dota_creep_lane' ||
		unit.getClassname() == 'npc_dota_creep' ||
		unit.getClassname() == 'npc_dota_creep_siege') {
			// Check if it is a dire creep
			if(keyvalues['TeamName'] == 'DOTA_TEAM_BADGUYS' || unit.netprops.m_iTeamNum == dota.TEAM_DIRE) {
				// Change model to random zombie
				if(Math.random() < 0.5) {
					keyvalues['model'] = 'models/heroes/undying/undying_minion_torso.mdl';
				} else {
					keyvalues['model'] = 'models/heroes/undying/undying_minion.mdl';
				}
				
				keyvalues['AttackCapabilities'] = 'DOTA_UNIT_CAP_MELEE_ATTACK';
				keyvalues['AttackRange'] = 128;
				
				// Ensure this unit doesn't have truesight
				timers.setTimeout(function() {
					// Grant truesight for the zombies on this unit
					removeTrueSight(unit);
				}, 1);
			} else {
				// We have to wait until the unit is created (one frame)
				timers.setTimeout(function() {
					// Grant truesight for the zombies on this unit
					trueSight(unit);
				}, 1);
				
			}
	}
}

function onClientPutInServer(client) {
	// Teleport them back in after a second
	timers.setTimeout(function() {
		if(!client || !client.isInGame()) return;
		var playerID = client.netprops.m_iPlayerID;
		if(playerID == -1) return;
		
		// Check if they are a zombie
		if(isZombie[playerID]) {
			// Grab pos
			var pos = DIRE_ANCIENT.netprops.m_vecOrigin;
			if(!pos) return;
			
			// Turn them into a zombie
			var heroes = client.getHeroes();
			for(var hh in heroes) {
				var hero = heroes[hh];
				
				// Turn into a zombie
				becomeZombie(hero);
				
				// Teleport them back towards the base
				dota.findClearSpaceForUnit(hero, pos);
			}
		} else {
			// Tell them about being a volunteer
			client.printToChat('Type -z to volunteer to be the zombie!');
		}
	}, 1000);
}

function onClientDisconnect(client) {
	var playerID = client.netprops.m_iPlayerID;
	if(playerID == -1) return;
	
	// Grab original team
	var oTeam = originalTeam[playerID];
	
	// Turn them into a zombie
	var heroes = client.getHeroes();
	for(var hh in heroes) {
		var hero = heroes[hh];
		
		// Turn into a zombie
		becomeZombie(hero);
		
		// Teleport out of arena
		if (oTeam == dota.TEAM_DIRE) {
			hero.teleport(-50000.0, 50000.0, 0.0);
		} else {
			hero.teleport(50000.0, -50000.0, 0.0);
		}
	}
	
	// Reset their team back to normal
	becomeOriginalTeam(client);
}

function CmdZombie(client) {
	var playerID = client.netprops.m_iPlayerID;
	if(playerID == -1) return;
	
	// Check if this player was infected, and make sure they aren't already a zombie
	if(isInfected[playerID] != null && !isZombie[playerID]) {
		var heroes = client.getHeroes();
		
		for(var hh in heroes) {
			var hero = heroes[hh];
			
			// Turn into a zombie
			becomeZombie(hero);
		}
	}
}

/*var particleFX = null;

console.addClientCommand('pa', function(client, args) {
	var heroes = client.getHeroes();
	for(var hh in heroes) {
		var hero = heroes[hh];
		
		server.print('particles');
		dota.loadParticleFile('particles/units/heroes/hero_viper.pcf');
		
		if (args.length >= 0) {
			// Remove existing FX
			if (particleFX) {
				for (var i = 0; i < server.clients.length; i++) {
					if (server.clients[i]) {
						dota.destroyParticle(server.clients[i], particleFX, false);
					}
				}
			}
			
			var part = 'venomancer_poison_debuff_nova';
			if (part) {
				dota.loadParticleFile('particles/units/heroes/hero_venomancer.pcf');
				particleFX = dota.createParticleEffect(hero, part, 1);
				
				var attachPt = "attach_static";
				if (args.length >= 1) attachPt = args[0];
				var ctrlPt = 0;
				//if (part.points) ctrlPt = part.points - 1;
				if (args.length >= 2) ctrlPt = parseInt(args[1]);
				var unknwn = 0;
				if (args.length >= 3) unknwn = parseInt(args[2]);
				var type = 0;
				if (args.length >= 4) type = parseInt(args[3]);
				
				//dota.setParticleControlEnt(unit:Entity, controlPoint:Int, unknown:Int, attachPoint:String, attachType:Int, index:Int)
				for (var i=0;i<=ctrlPt;i++){
					dota.setParticleControlEnt(hero, i, unknwn, attachPt, type, particleFX);
					client.printToChat("Particle: "+part+" Attach: "+attachPt+" ctrlPt: "+i+" unknown: "+unknwn+" type: "+type);
				}
			} else {
				client.printToChat("Particle index not found");
			}
		}
	}
});*/

function CmdZ(client) {
	var playerID = client.netprops.m_iPlayerID;
	if(playerID == -1) return;
	
	if(wantsToBeInfected.indexOf(playerID) == -1) {
		// This player wants to be infected
		wantsToBeInfected.push(playerID);
		
		// Tell them they will now have a larger chance to be infected
		client.printToChat('You have a larger chance to become infected now!');
	}
}

var patchedGold = {};
function goldPatch(client) {
	timers.setTimeout(function() {
		if(!client || !client.isValid()) return;
		
		var playerID = client.netprops.m_iPlayerID;
		if (playerID == -1) return;
		
		// Make sure it only runs once for each player
		if(patchedGold[playerID]) return;
		patchedGold[playerID] = true;
		
		// Set their unreliable gold right up
		playerManager.netprops.m_iUnreliableGoldRadiant[playerID] += 2397;
		playerManager.netprops.m_iUnreliableGoldDire[playerID] +=  2397;
	}, 1000);
}

// Allows zombies to see this unit
function trueSight(unit) {
	if(!unit || !unit.isValid() || !DIRE_ANCIENT || !DIRE_ANCIENT.isValid() || !DIRE_ANCIENT.trueSight || !DIRE_ANCIENT.trueSight.isValid()) return;
	
	// Add thirst modifier
	dota.addNewModifier(unit, DIRE_ANCIENT.trueSight, 'modifier_bloodseeker_thirst_vision', "bloodseeker_thirst", {});
}

// Removes truesight on a unit
function removeTrueSight(unit) {
	if(!unit || !unit.isValid()) return;
	
	// Remove thirst from this unit
	dota.removeModifier(unit, 'modifier_bloodseeker_thirst_vision');
}

function becomeDire(client) {
	if(!client) return;
	
	// Grab current team
	var currentTeam = client.netprops.m_iTeamNum;
	
	// Update team
	client.netprops.m_iTeamNum = dota.TEAM_DIRE;
	
	// Fix couriers
	courierFix()
	
	// Grab playerID
	var playerID = client.netprops.m_iPlayerID;
	if(playerID == -1) return;
	
	// Store original team
	if(!originalTeam[playerID]) {
		originalTeam[playerID] = playerManager.netprops.m_iPlayerTeams[playerID];
	}
	
	var heroes = client.getHeroes();
	for(var hh in heroes) {
		var hero = heroes[hh];
		if(!hero) continue;
		
		// Change team
		hero.netprops.m_iTeamNum = dota.TEAM_DIRE;
	}
}

function becomeRadiant(client) {
	if(!client) return;
	
	// Grab current team
	var currentTeam = client.netprops.m_iTeamNum;
	
	// Update team
	client.netprops.m_iTeamNum = dota.TEAM_RADIANT;
	
	// Fix couriers
	courierFix()
	
	// Grab playerID
	var playerID = client.netprops.m_iPlayerID;
	if(playerID == -1) return;
	
	// Store original team
	if(!originalTeam[playerID]) {
		originalTeam[playerID] = playerManager.netprops.m_iPlayerTeams[playerID];
	}
	
	var heroes = client.getHeroes();
	for(var hh in heroes) {
		var hero = heroes[hh];
		if(!hero) continue;
		
		// Change team
		hero.netprops.m_iTeamNum = dota.TEAM_RADIANT;
	}
}

function courierFix() {
	// Find all couriers
	var couriers = game.findEntitiesByClassname('npc_dota_courier');
	
	// Loop over eveyr courier
	for(var i=0;i<couriers.length;i++) {
		// Grab a courier
		var courier = couriers[i];
		
		// Reset it's controllable status
		courier.netprops.m_iIsControllableByPlayer = 0;
		
		// Grab it's team
		var team = courier.netprops.m_iTeamNum;
		
		// Loop over all players
		for(var j=0; j<dota.MAX_PLAYERS;j++) {
			// Grab a client
			var client = dota.findClientByPlayerID(j);
			if(!client) continue;
			
			// Check if they are on the same team
			if(team == client.netprops.m_iTeamNum) {
				// Allow this client to controle it
				courier.netprops.m_iIsControllableByPlayer += 1 << j;
			}
		}
	}
	
	
}

// Puts them back onto their original team
function becomeOriginalTeam(client) {
	var playerID = client.netprops.m_iPlayerID;
	if(playerID == -1) return;
	
	// Make sure they have an original team
	if(originalTeam[playerID]) {
		if(originalTeam[playerID] == dota.TEAM_RADIANT) {
			becomeRadiant(client);
		} else if(originalTeam[playerID] == dota.TEAM_DIRE) {
			becomeDire(client);
		}
	}
}

// Infects more people if the humans are pwning
function zombieFairnessTest() {
	var totalZombies = 0;
	var totalHumans = 0;
	
	// Check how many people are infected
	for(var i=0; i<server.clients.length;i++) {
		// Grab, validate client
		var client = server.clients[i];
		if(!client || !client.isInGame()) continue;
		
		// Grab playerID
		var playerID = client.netprops.m_iPlayerID;
		
		// Check if this player is a zombie
		if(isZombie[playerID]) {
			totalZombies += 1;
		} else {
			totalHumans += 1;
		}
	}
	
	// Check if we need to infect someone
	if(totalHumans > totalZombies) {
		var possibleHumans = new Array();
		
		// Check how many people are infected
		for(var i=0; i<server.clients.length;i++) {
			// Grab, validate client
			var client = server.clients[i];
			if(!client || !client.isInGame()) continue;
			
			// Grab playerID
			var playerID = client.netprops.m_iPlayerID;
			if(playerID == -1) continue;
			
			// Check if this player is a zombie
			if(!isZombie[playerID] && isInfected[playerID] == null) {
				possibleHumans.push(playerID);
			}
		}
		
		// Check if there are any possible humans
		if(possibleHumans.length <= 0) return;
		
		// Pick a random human to become a zombie
		var newZombieID = possibleHumans[Math.floor((Math.random()*possibleHumans.length))];
		
		// Ensure the zombieID is valid
		if(newZombieID == null) return;
		
		// Infect this person
		isInfected[newZombieID] = true;
		
		// Tell them they are infected
		var c = dota.findClientByPlayerID(newZombieID);
		if(c) {
			c.printToChat('You\'ve been infected! You will turn into a zombie in 30 seconds!');
			c.printToChat('Type -zombie to change instantly!');
			
			// Add a warning timer
			timers.setTimeout(function() {
				if(!c || !c.isInGame) return;
				
				// Make sure they haven't changed into a zombie already
				if(!isZombie[playerID]) {
					c.printToChat('You are about to change into a zombie!!!');
				}
			}, 1000 * (30 - 3));
			
			// Grab heroes
			var heroes = c.getHeroes();
			
			// Add the timer to change them!
			timers.setTimeout(function() {
				// Make sure they haven't turned already
				if(!isZombie[playerID]) {
					// Turn all their heroes into zombies
					for(var hh in heroes) {
						var hero = heroes[hh];
						if(!hero) continue;
						
						// Become a zombie!
						becomeZombie(hero);
					}
				}
			}, 1000 * 30);
			
			// This player is no longer infected
			isInfected[playerID] = false;
		}
	}
}

function resetTeamRadiant(playerID) {
	// Reset them to their original team after 1 second
	timers.setTimeout(function() {
		// Reset their team
		playerManager.netprops.m_iPlayerTeams[playerID] = originalTeam[playerID];
		
		// Reset their gold
		playerManager.netprops.m_iReliableGoldRadiant[playerID] = playerManager.netprops.m_iReliableGoldDire[playerID];
		playerManager.netprops.m_iUnreliableGoldRadiant[playerID] = playerManager.netprops.m_iUnreliableGoldDire[playerID];
	}, 1);
}

function resetTeamDire(playerID) {
	// Reset them to their original team after 1 second
	timers.setTimeout(function() {
		// Reset their team
		playerManager.netprops.m_iPlayerTeams[playerID] = originalTeam[playerID];
		
		// Reset their gold
		playerManager.netprops.m_iReliableGoldDire[playerID] = playerManager.netprops.m_iReliableGoldRadiant[playerID];
		playerManager.netprops.m_iUnreliableGoldDire[playerID] = playerManager.netprops.m_iUnreliableGoldRadiant[playerID];
	}, 1);
}

function onEntityHurt(event) {
	// Grab the entity that was attacked
	var ent = game.getEntityByIndex(event.getInt('entindex_killed'));
	
	// Grab the ent's HP
	var entHP = ent.netprops.m_iHealth;
	
	if(entHP <= 0) {
		// Loop over all clients
		for(var i=0;i<server.clients.length;i++) {
			// Grab client
			var client = server.clients[i]
			if(!client || !client.isInGame()) continue;
			
			var playerID = client.netprops.m_iPlayerID;
			if(playerID == -1) continue;
			
			// Make sure they have an original team
			if(originalTeam[playerID]) {
				// Grab their team
				var team = client.netprops.m_iTeamNum;
				
				// Only need to do this if they aren't on their original team AND a change isn't currently in progress!
				if(team != originalTeam[playerID] && originalTeam[playerID] == playerManager.netprops.m_iPlayerTeams[playerID]) {
					// Put them onto the 'correct' team for a moment
					playerManager.netprops.m_iPlayerTeams[playerID] = team;
					
					if(team == dota.TEAM_DIRE) {
						// Copy their gold into their other team's slot
						playerManager.netprops.m_iReliableGoldDire[playerID] = playerManager.netprops.m_iReliableGoldRadiant[playerID];
						playerManager.netprops.m_iUnreliableGoldDire[playerID] = playerManager.netprops.m_iUnreliableGoldRadiant[playerID];
						
						// Reset this player's team
						resetTeamRadiant(playerID);
					} else if(team == dota.TEAM_RADIANT) {
						// Copy their gold into their other team's slot
						playerManager.netprops.m_iReliableGoldRadiant[playerID] = playerManager.netprops.m_iReliableGoldDire[playerID];
						playerManager.netprops.m_iUnreliableGoldRadiant[playerID] = playerManager.netprops.m_iUnreliableGoldDire[playerID];
						
						// Reset the player's team
						resetTeamDire(playerID)
					}
				}
			}
		}
	}
	
	if(entHP <= 0) {
		// Remove reference if it is a tower
		if(tower1 == ent) {
			tower1 = null;
		}
		
		if(tower2 == ent) {
			tower2 = null;
			
			// Check if we should infect more humans
			zombieFairnessTest();
		}
		
		if(tower3 == ent) {
			tower3 = null;
			
			// Check if we should infect more humans
			zombieFairnessTest();
		}
	}
	
	// Check if it is a hero
	if(ent.isHero()) {
		// Check if they will die as a result of this
		if(entHP == 0) {
			if(ent.netprops.m_bIsIllusion) return;
			
			var playerID = ent.netprops.m_iPlayerID;
			if(playerID == -1) return;
			
			// Grab client
			var client = dota.findClientByPlayerID(playerID);
			if(!client) return;
			
			// Grab list of heroes
			var heroes = client.getHeroes();
			
			// Make sure this hero is one of our heroes
			if(heroes.indexOf(ent) == -1) return;
			
			// Check if this client is already a zombie
			if(isZombie[playerID]) {
				// Grab the current time
				var gametime = game.rules.props.m_fGameTime;
				
				// Respawn them after 2 seconds
				timers.setTimeout(function() {
					for(var hh in heroes) {
						var hero = heroes[hh];
						
						hero.netprops.m_flRespawnTime = gametime + 2;
					}
				}, 1)
			} else {
				var hasAegis = false;
				
				// Search for aegis
				aegisLoop:
				for(var hh in heroes) {
					var hero = heroes[hh];
					
					// Seach inventory slots
					for(var i=0; i<6;i++) {
						// Grab item
						var item = hero.netprops.m_hItems[i];
						
						// Check if it's valid
						if(item && item.isValid()) {
							// Check if it's an Aegis
							if(item.getClassname() == 'item_aegis') {
								// They have an aegis
								hasAegis = true;
								
								// Break out of the aegis loop
								break aegisLoop;
							}
						}
					}
				}
				
				// Check if they have the aegis
				if(hasAegis) {
					// Possibly gonna do something here in the future
					
					// Stop them from becoming a zombie
					return;
				}
				
				for(var hh in heroes) {
					var hero = heroes[hh];
					
					// Strip all items
					for(var i=0; i<6;i++) {
						// Grab item
						var item = hero.netprops.m_hItems[i];
						
						// Check if it's valid
						if(item && item.isValid()) {
							// Remove the item
							dota.remove(item);
						}
					}
					
					// Set health to 0
					hero.netprops.m_iHealth = 0;
					
					// Give aegis
					dota.giveItemToHero('item_aegis', hero)
					
					// Become a zombie in 1 second
					timers.setTimeout(function() {
						becomeZombie(hero);
					}, 5100);
				}
			}
		}
	}
}

function onPlayerGainedLevel(event) {
	// Update everyone's skills
	for(var i=0;i<server.clients.length;i++) {
		// Grab a client
		var client = server.clients[i];
		
		// Check if this client is a zombie
		if(client && isZombie[client.netprops.m_iPlayerID]) {
			var heroes = client.getHeroes();
			for(var hh in heroes) {
				var hero = heroes[hh];
				
				// Update stats
				setZombieStats(hero);
			}
		}
	}
}

function giveGold(playerID, amount) {
	playerManager.netprops.m_iUnreliableGoldRadiant[playerID] += amount;
	playerManager.netprops.m_iUnreliableGoldDire[playerID] +=  amount;
}

var leapSkills = new Array(
	'mirana_leap',
	'antimage_blink',
	'magnataur_skewer',
	'morphling_waveform',
	'faceless_void_time_walk',
	'riki_blink_strike'
);

var trapSkills = new Array(
	'meepo_earthbind',
	'life_stealer_open_wounds',
	'treant_leech_seed'
);

var utilSkills = new Array(
	'pudge_meat_hook',
	'pudge_rot',
	'pudge_dismember',
	'life_stealer_rage',
	'undying_tombstone',
	'alchemist_acid_spray',
	'bristleback_viscous_nasal_goo',
	'centaur_stampede',
	'furion_force_of_nature'
);

// List of skills where level 3 is the max  they go to
var maxThree = new Array(
	'centaur_stampede', 
	'pudge_dismember'
);

function getRandomSkill(ar) {
	return ar[Math.floor(Math.random()*ar.length)];
}

function becomeZombie(hero) {
	// Validate hero
	if(!hero) return;
	
	// Grab playerID
	var playerID = hero.netprops.m_iPlayerID;
	if(playerID == -1) return;
	
	// Grab client
	var client = dota.findClientByPlayerID(playerID);
	if (!client) return;
	
	// Change team to dire
	becomeDire(client);
	
	// Remove true sight
	removeTrueSight(hero);
	
	// The hero now has skills
	hero.hasSkills = true;
	
	// Remove all old skills
	for(var i=0;i<16;i++) {
		var ab = hero.netprops.m_hAbilities[i];
		
		if(ab != null) {
			dota.remove(ab);
			hero.netprops.m_hAbilities[i] = null;
		}
		
	}
		
	// Add leap skill
	hero.leapSkill = dota.createAbility(hero, getRandomSkill(leapSkills));
	dota.setAbilityByIndex(hero, hero.leapSkill, 0);
	
	// Add teleport skill
	hero.teleportSkill = dota.createAbility(hero, 'furion_teleportation');
	dota.setAbilityByIndex(hero, hero.teleportSkill, 1);
	
	// Add trap skill
	hero.trapSkill = dota.createAbility(hero, getRandomSkill(trapSkills));
	dota.setAbilityByIndex(hero, hero.trapSkill, 2);
	
	// Add util skill
	hero.utilSkillName = getRandomSkill(utilSkills)
	hero.utilSkill = dota.createAbility(hero, hero.utilSkillName);
	dota.setAbilityByIndex(hero, hero.utilSkill, 3);
	
	// Add Life Steal
	hero.feast = dota.createAbility(hero, 'life_stealer_feast');
	dota.setAbilityByIndex(hero, hero.feast, 4);
	
	// Add venem
	hero.poisonSkill = dota.createAbility(hero, 'broodmother_incapacitating_bite');
	dota.setAbilityByIndex(hero, hero.poisonSkill, 5);
	
	// Create ult
	hero.mutatorSkill = dota.createAbility(hero, 'undying_flesh_golem');
	hero.mutatorSkill.netprops.m_iLevel = 3;
	
	// Apply zombie ult
	dota.addNewModifier(hero, hero.mutatorSkill, 'modifier_undying_flesh_golem', "undying_flesh_golem", {});	// Apply this first so we get the correct model
	
	// Store that this hero is a zombie
	isZombie[client.netprops.m_iPlayerID] = true;
	
	// Set the stats
	setZombieStats(hero);
	
	// Only end the game if it's not singleplayer
	if(!singlePlayer) {
		// Check for win status
		var total = 0;
		for(var i=0;i<server.clients.length;i++) {
			var client = server.clients[i];
			
			if(!client || isZombie[client.netprops.m_iPlayerID]) {
				total += 1;
			}
		}
		
		// Check if everyone is a zombie
		if(total >= server.clients.length) {
			// Force dire victory
			dota.forceWin(dota.TEAM_RADIANT);	// Backwards to what you'd think?
		}
	}
}

function setZombieStats(hero) {
	// Ensure this is a zombie
	if(!hero) return;
	
	// Grab playerID, validate
	var playerID = hero.netprops.m_iPlayerID;
	if(playerID == -1) return;
	
	if(!isZombie[playerID]) return;
	
	// Remove skill points
	hero.netprops.m_iAbilityPoints = 0;
		
	// Grab level
	var level = hero.netprops.m_iCurrentLevel || 1;
	
	// Set stats
	hero.netprops.m_flStrength = 30		+ 4 * level;
	hero.netprops.m_flAgility = 30		+ 4 * level;
	hero.netprops.m_flIntellect = 30	+ 4 * level;
	
	// Modify Stats
	hero.keyvalues['MovementSpeed'] = 200;
	hero.keyvalues['MovementTurnRate'] = 0.6;
	hero.keyvalues['ArmorPhysical'] = 2;
	hero.keyvalues['AttackCapabilities'] = 'DOTA_UNIT_CAP_MELEE_ATTACK';
	hero.keyvalues['AttackDamageMin'] = 35;
	hero.keyvalues['AttackDamageMax'] = 43;
	hero.keyvalues['AttackRate'] = 1.7;
	hero.keyvalues['AttackAnimationPoint'] = 0.3;
	hero.keyvalues['AttackAcquisitionRange'] = 600;
	hero.keyvalues['AttackRange'] = 128;
	
	// Check if they are alpha
	if(isAlphaZombie[playerID]) {
		// Bonus movespeed for the alpha
		hero.keyvalues['MovementSpeed'] = 240;
		
		// Bonus armor for the alpha
		hero.keyvalues['ArmorPhysical'] = 5;
		
		// Bonus stats for the alpha
		hero.netprops.m_flStrength += 20;
		hero.netprops.m_flAgility += 20;
		hero.netprops.m_flIntellect += 20;
	}
	
	// Make it melee
	hero.netprops.m_iAttackCapabilities = 1;
	
	// Workout what level our skills should be at
	var skillLevel = Math.floor(level/4);
	if(skillLevel > 3){ skillLevel = 3; }
	
	// Ensure this hero has skills
	if(!hero.hasSkills) return;
	
	// Mod the skills
	hero.leapSkill.netprops.m_iLevel = skillLevel+1;
	hero.poisonSkill.netprops.m_iLevel = skillLevel+1;
	hero.feast.netprops.m_iLevel = skillLevel+1;
	hero.teleportSkill.netprops.m_iLevel = skillLevel+1;
	hero.trapSkill.netprops.m_iLevel = skillLevel+1;
	
	// Check if it is an ult
	if(maxThree.indexOf(hero.utilSkillName)) {
		// Limit level to 2
		if(skillLevel == 3) {
			skillLevel = 2;
		}
	}
	
	hero.utilSkill.netprops.m_iLevel = skillLevel+1;
}

function becomeHuman(client) {
	if (!client) return;
	
	becomeRadiant(client);
}

// Create timer to remove items from zombies (runs once every 10 seconds)
timers.setInterval(function() {
	// Cycle over every client
	for(var i=0;i<server.clients.length;i++) {
		// Grab a client
		var client = server.clients[i];
		if(!client) continue;
		
		var playerID = client.netprops.m_iPlayerID;
		if(playerID == -1) continue;
		
		// Check if this client is a zombie
		if(isZombie[playerID] && !isAlphaZombie[playerID]) {
			var heroes = client.getHeroes();
			for(var hh in heroes) {
				var hero = heroes[hh];
				
				// Remove all items
				for(var j=0; j<6;j++) {
					// Grab item
					var item = hero.netprops.m_hItems[j];
					
					// Check if it's valid
					if(item && item.isValid()) {
						// Remove the item
						dota.remove(item);
					}
				}
			}
		}
	}
}, 10000);

// Create timer to level all zombies
timers.setInterval(function() {
	var maxLevel = 0;
	
	// Cycle over every client
	for(var i=0;i<server.clients.length;i++) {
		// Grab a client
		var client = server.clients[i];
		if(!client) continue;
		
		var heroes = client.getHeroes();
		for(var hh in heroes) {
			var hero = heroes[hh];
			
			// Grab it's level
			var level = hero.netprops.m_iCurrentLevel || 1;
			
			// Check if this player has a higher level
			if(level > maxLevel) {
				maxLevel = level;
			}
		}
	}
	
	// Set all zombie's level up
	for(var i=0;i<server.clients.length;i++) {
		// Grab a client
		var client = server.clients[i];
		if(!client) continue;
		
		var heroes = client.getHeroes();
		for(var hh in heroes) {
			var hero = heroes[hh];
			
			// Check if this client is a zombie
			if(isZombie[client.netprops.m_iPlayerID]) {
				// Grab it's level
				var level = hero.netprops.m_iCurrentLevel || 1;
				
				// Check if level is lower
				if(level < maxLevel) {
					// Adjust this zombies level
					hero.netprops.m_iCurrentLevel = maxLevel;
					
					// Adjust their stats
					setZombieStats(hero);
				}
			}
		}
	}
}, 120000);

