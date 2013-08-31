/*
Singleplayer Mode

Turn this on if you want to test by yourself, and turn
	singleplayer bots on if you'd like some bots to play with (they just stand there)

NOTE: The icons at the top don't show the correct teams
*/
var singlePlayer = false;
var addSinglePlayerBots = false;
var spawnAsZombie = false;			// Do you want to spawn as the zombie?

// Grab libraries
var timers = require('timers');

// Hook stuff
game.hook('OnMapStart', onMapStart);
game.hook("Dota_OnHeroPicked", onHeroPicked);
game.hook("Dota_OnHeroSpawn", onHeroSpawn);
game.hook("Dota_OnBuyItem", onBuyItem);
game.hook("OnGameFrame", onGameFrame);
game.hook("Dota_OnUnitParsed", onUnitParsed);

// Hook events
game.hookEvent("entity_hurt", onEntityHurt);
game.hookEvent("dota_player_gained_level", onPlayerGainedLevel);

// Add console commands
console.addClientCommand('zombie', CmdZombie);

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

// We need to store radiants ancient
var DIRE_ANCIENT;

var ZOMBIE_INFECT_DELAY = 60;	// Delay before infection takes someone over (in seconds)

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

function onMapStart() {
	// Store dire's ancient
	DIRE_ANCIENT = game.findEntityByTargetname('dota_badguys_fort');
	
	// Add bloodlust to the ancient
	DIRE_ANCIENT.trueSight = dota.createAbility(DIRE_ANCIENT, 'bloodseeker_thirst');
	
	// Stop undying from being picked
	dota.setHeroAvailable(85 , false);
	
	// Precache particles + models needed for the zombie
	dota.loadParticleFile('particles/units/heroes/hero_mirana.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_undying.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_broodmother.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_meepo.pcf');
	dota.loadParticleFile('particles/units/heroes/hero_furion.pcf');
	game.precacheModel('models/heroes/undying/undying_flesh_golem.mdl');
	game.precacheModel('models/heroes/undying/undying_minion.mdl');
	game.precacheModel('models/heroes/undying/undying_minion_torso.mdl');
	
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
}

function onHeroSpawn(hero) {
	// Grab playerID
	var playerID = hero.netprops.m_iPlayerID;
	
	// Grab client
	var client = dota.findClientByPlayerID(playerID);
	if(!client) return;
	
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
		
	} else {
		// Make this person human
		becomeHuman(client);
		
		// Give zombies truesight to this hero
		trueSight(hero);
		
		// Check if this player is infected
		if(isInfected[playerID]) {
			// Tell the client what's going on
			client.printToChat('You are infected! You will turn into a zombie in '+ZOMBIE_INFECT_DELAY+' seconds!');
			client.printToChat('Try to stand near someone so you can eat their brains, or run back towards the dire base so you don\'t feed the humans!');
			client.printToChat('Type -zombie to change instantly!');
			
			// Add a warning timer
			timers.setTimeout(function() {
				// Make sure they haven't changed into a zombie already
				if(!isZombie[playerID]) {
					client.printToChat('You are about to change into a zombie!!!');
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
		}
	}
}

function onHeroPicked(client, heroName){
	// Put them onto radiant
	becomeRadiant(client);
	
	// Check if there is already a zombie
	if(zombieID == -1) {
		var possibleZombies = new Array();
		
		// Build list of possible zombies
		for(var i=0;i<server.clients.length;i++) {
			// Grab client
			var client = server.clients[i];
			
			// Make sure this client is valid
			if(client != null && client.isInGame() && client.netprops.m_iPlayerID != -1) {
				// Push this clients ID into possible zombies
				possibleZombies.push(client.netprops.m_iPlayerID);
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
		}
		
		// Grab the client that corosponds to this zombie
		var zombie = dota.findClientByPlayerID(zombieID);
		
		if(zombie == null) {
			// Shit is broken!! (mostly here for dev reasons)
			server.print('\n\nZOMBIE GAMEMODE IS BROKEN!\n\n');
			return;
		}
	} else if(zombieID == client.netprops.m_iPlayerID) {
		// Put them onto dire
		//becomeDire(client);
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
	
	// Stop zombies from buying items
	if(isZombie[client.netprops.m_iPlayerID]) {
		return false;
	}
}

// Force mid only
function onGameFrame(){
	cvForceGameMode.setInt(11);
}

function onUnitParsed(unit, keyvalues){
	// Check if it is one of our units
	if(unit.getClassname() == 'npc_dota_creep_lane' ||
	   unit.getClassname() == 'npc_dota_creep_siege') {
			// Check if it is a dire creep
			if(keyvalues['TeamName'] == 'DOTA_TEAM_BADGUYS') {
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

function CmdZombie(client) {
	var playerID = client.netprops.m_iPlayerID;
	
	// Check if this player was infected, and make sure they aren't already a zombie
	if(isInfected[playerID] != null && !isZombie[playerID]) {
		// Grab their hero
		var hero = grabHero(client);
		if(!hero) return;
		
		// Turn into a zombie
		becomeZombie(hero);
	}
}

// Allows zombies to see this unit
function trueSight(unit) {
	if(!unit) return;
	
	// Add thirst modifier
	dota.addNewModifier(unit, DIRE_ANCIENT.trueSight, 'modifier_bloodseeker_thirst_vision', "bloodseeker_thirst", {duration:36000});
}

// Removes truesight on a unit
function removeTrueSight(unit) {
	if(!unit) return;
	
	// Remove thirst from this unit
	dota.removeModifier(unit, 'modifier_bloodseeker_thirst_vision');
}

function becomeDire(client) {
	if(!client) return;
	
	// Change their team in the player manager
	playerManager.netprops.m_iPlayerTeams[client.netprops.m_iPlayerID] = dota.TEAM_DIRE;
	
	// Change client's team
	//client.changeTeam(dota.TEAM_DIRE);
	client.netprops.m_iTeamNum = dota.TEAM_DIRE;
	
	var hero = grabHero(client);
	if(!hero) return;
	
	// Change hero's team
	//hero.changeTeam(dota.TEAM_DIRE);
	hero.netprops.m_iTeamNum = dota.TEAM_DIRE;
}

function becomeRadiant(client) {
	if(!client) return;
	
	// Change their team in the player manager
	playerManager.netprops.m_iPlayerTeams[client.netprops.m_iPlayerID] = dota.TEAM_RADIANT;
	
	// Change client's team
	//client.changeTeam(dota.TEAM_RADIANT);
	client.netprops.m_iTeamNum = dota.TEAM_RADIANT;
	
	// Check if they have a hero yet
	var hero = grabHero(client);
	if(!hero) return;
	
	// Change hero's team
	//hero.changeTeam(dota.TEAM_RADIANT);
	hero.netprops.m_iTeamNum = dota.TEAM_RADIANT;
}

function onEntityHurt(event) {
	// Grab the entity that was attacked
	var ent = game.getEntityByIndex(event.getInt('entindex_killed'));
	
	if(ent.netprops.m_iHealth <= 0) {
		// Remove reference if it is a tower
		if(tower1 == ent) {
			tower1 = null;
		}
		
		if(tower2 == ent) {
			tower2 = null;
		}
		
		if(tower3 == ent) {
			tower3 = null;
		}
	}
	
	// Check if it is a hero
	if(ent.isHero()) {
		// Check if they will die as a result of this
		if(ent.netprops.m_iHealth == 0) {
			var playerID = ent.netprops.m_iPlayerID;
			if(playerID == -1) return;
			
			// Grab client
			var client = dota.findClientByPlayerID(playerID);
			if(!client) return;
			
			// Check if this client is already a zombie
			if(isZombie[playerID]) {
				// Grab the current time
				var gametime = game.rules.props.m_fGameTime;
				
				// Respawn them after 2 seconds
				timers.setTimeout(function() {
					ent.netprops.m_flRespawnTime = gametime + 2;
				}, 1)
			} else {
				// Strip all items
				for(var i=0; i<6;i++) {
					// Grab item
					var item = ent.netprops.m_hItems[i];
					
					// Check if it's valid
					if(item && item.isValid()) {
						// Remove the item
						dota.remove(item);
					}
				}
				
				// Give aegis
				dota.giveItemToHero('item_aegis', ent)
				
				// Become a zombie in 1 second
				timers.setTimeout(function() {
					becomeZombie(ent);
				}, 5100)
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
			var hero = grabHero(client);
			if(!hero) return;
			
			// Update stats
			setZombieStats(hero);
		}
	}
}

function giveGold(playerID, amount) {
	playerManager.netprops.m_iUnreliableGoldRadiant[playerID] += amount;
	playerManager.netprops.m_iUnreliableGoldDire[playerID] +=  amount;
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
	
	// Check for abiltities
	if(!hero.hasSkills) {
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
		hero.leapSkill = dota.createAbility(hero, 'mirana_leap');
		dota.setAbilityByIndex(hero, hero.leapSkill, 0);
		
		// Add teleport skill
		hero.teleportSkill = dota.createAbility(hero, 'furion_teleportation');
		dota.setAbilityByIndex(hero, hero.teleportSkill, 1);
		
		// Add earthbind skill
		hero.earthbindSkill = dota.createAbility(hero, 'meepo_earthbind');
		dota.setAbilityByIndex(hero, hero.earthbindSkill, 2);
		
		// Add Life Steal
		hero.feast = dota.createAbility(hero, 'life_stealer_feast');
		dota.setAbilityByIndex(hero, hero.feast, 3);
		
		// Add spell shield
		hero.shieldSkill = dota.createAbility(hero, 'antimage_spell_shield');
		dota.setAbilityByIndex(hero, hero.shieldSkill, 4);
		
		// Add venem
		hero.poisonSkill = dota.createAbility(hero, 'broodmother_incapacitating_bite');
		dota.setAbilityByIndex(hero, hero.poisonSkill, 5);
		
		// Create ult
		hero.mutatorSkill = dota.createAbility(hero, 'undying_flesh_golem');
		hero.mutatorSkill.netprops.m_iLevel = 3;
	}
	
	// Apply zombie ult
	dota.addNewModifier(hero, hero.mutatorSkill, 'modifier_undying_flesh_golem', "undying_flesh_golem", {duration:36000});	// Apply this first so we get the correct model
	
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
	if(!isZombie[hero.netprops.m_iPlayerID]) return;
	
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
	
	// Make it melee
	hero.netprops.m_iAttackCapabilities = 1;
	
	// Workout what level our skills should be at
	var skillLevel = Math.floor(level/4);
	if(skillLevel > 3){ skillLevel = 3; }
	
	// Ensure this hero has skills
	if(!hero.hasSkills) return;
	
	// Mod the skills
	hero.leapSkill.netprops.m_iLevel = skillLevel+1;
	hero.shieldSkill.netprops.m_iLevel = skillLevel+1;
	hero.poisonSkill.netprops.m_iLevel = skillLevel+1;
	hero.feast.netprops.m_iLevel = skillLevel+1;
	hero.teleportSkill.netprops.m_iLevel = skillLevel+1;
	hero.earthbindSkill.netprops.m_iLevel = skillLevel+1;
}

function becomeHuman(client) {
	if (!client) return;
	
	becomeRadiant(client);
}

// Grabs a hero or return false if the client doesn't have one
function grabHero(client) {
	var hero = client.netprops.m_hAssignedHero;
	
	// Check if the hero is valid:
	if(!hero || !hero.isHero()) return null;
	
	return hero;
}

// Create timer to remove items from zombies (runs once every 10 seconds)
timers.setInterval(function() {
	// Cycle over every client
	for(var i=0;i<server.clients.length;i++) {
		// Grab a client
		var client = server.clients[i];
		if(!client) continue;
		
		// Check if this client is a zombie
		if(isZombie[client.netprops.m_iPlayerID]) {
			// Grab this client's hero
			var hero = grabHero(client);
			if(!hero) continue;
			
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
}, 10000);

// Create timer to level all zombies
timers.setInterval(function() {
	var maxLevel = 0;
	
	// Cycle over every client
	for(var i=0;i<server.clients.length;i++) {
		// Grab a client
		var client = server.clients[i];
		if(!client) continue;
		
		// Grab this client's hero
		var hero = grabHero(client);
		if(!hero) continue;
		
		// Grab it's level
		var level = hero.netprops.m_iCurrentLevel || 1;
		
		// Check if this player has a higher level
		if(level > maxLevel) {
			maxLevel = level;
		}
	}
	
	// Set all zombie's level up
	for(var i=0;i<server.clients.length;i++) {
		// Grab a client
		var client = server.clients[i];
		if(!client) continue;
		
		// Grab this client's hero
		var hero = grabHero(client);
		if(!hero) continue;
		
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
}, 120000);

