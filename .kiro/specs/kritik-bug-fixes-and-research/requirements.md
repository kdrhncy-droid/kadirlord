# Requirements Document

## Introduction

This document defines requirements for critical bug fixes and research for the Kadirlord project. The system addresses eleven critical issues categorized into three priority groups: Critical Bugs (game-breaking issues), Mechanic Errors (Bannerlord accuracy violations), and Quality Issues (architecture and rendering problems). Each requirement follows the Altın Kural (Golden Rule): every game mechanic must be researched against actual Bannerlord behavior through both textual sources (rules/formulas/terms) and visual sources (screenshots/layouts/colors) before implementation.

## Glossary

- **Save_Load_System**: THE system responsible for persisting and restoring game state, including player position, lord positions, settlement ownership, and campaign progress
- **White_Screen_Bug**: A freeze or blank display that occurs after specific game events (trade, battle) requiring application restart
- **Battle_Performance_System**: THE system managing frame rate and rendering optimization during large-scale combat
- **Diplomacy_UI**: THE user interface displaying kingdom relationships, war status, and diplomatic options on the campaign map
- **Workshop_System**: THE economic system allowing players to purchase and manage production facilities in settlements
- **Lord_AI_Recruitment**: THE behavior system governing how AI lords collect troops from settlements
- **Map_Color_System**: THE visual system displaying faction relationships through color coding on the campaign map
- **Siege_Mechanic**: THE system governing castle/town assault preparation, garrison behavior, and defender positioning
- **Lord_Hover_Tooltip**: THE information display shown when hovering over lord parties on the campaign map
- **Code_Architecture**: THE structural organization of source files, modules, and data flow patterns
- **Terrain_Rendering**: THE system generating and displaying battle environment geometry

## Requirements

### Requirement 1: Save and Load State Integrity

**User Story:** As a player, I want my game state to persist correctly across save/load cycles, so that my progress, position, and the world state remain consistent

#### Acceptance Criteria

1. WHEN THE player saves the game, THE Save_Load_System SHALL persist player party position with coordinate precision matching campaign map resolution
2. WHEN THE player saves the game, THE Save_Load_System SHALL persist all lord party positions with coordinate precision matching campaign map resolution
3. WHEN THE player loads a saved game, THE Save_Load_System SHALL restore player party position to the exact saved coordinates
4. WHEN THE player loads a saved game, THE Save_Load_System SHALL restore all lord party positions to their exact saved coordinates
5. WHEN THE player loads a saved game, THE Save_Load_System SHALL restore settlement ownership matching the saved kingdom state
6. WHEN THE player loads a saved game, THE Save_Load_System SHALL restore all campaign timers (quests, pregnancies, construction) to their saved values
7. WHEN THE player loads a saved game, THE Save_Load_System SHALL restore party rosters with exact troop counts and types
8. IF THE save file version differs from current game version, THEN THE Save_Load_System SHALL migrate data without loss of core game state

### Requirement 2: Post-Event White Screen Prevention

**User Story:** As a player, I want the game to remain responsive after trading and battles, so that I do not lose progress or need to restart

#### Acceptance Criteria

1. WHEN THE player completes a trade transaction, THE game SHALL return to the map view within 200 milliseconds
2. WHEN THE player exits a battle (victory, defeat, or retreat), THE game SHALL return to the map view within 500 milliseconds
3. IF THE rendering pipeline encounters an error during transition, THEN THE game SHALL log the error and display a recovery dialog instead of freezing
4. WHEN THE player closes a modal or dialog, THE game SHALL resume map time progression according to the saved speed setting
5. THE game SHALL maintain input responsiveness during all state transitions between map and modal views

### Requirement 3: Large Battle Performance Optimization

**User Story:** As a player, I want smooth performance during 50v50 and larger battles, so that combat remains playable and responsive

#### Acceptance Criteria

1. WHEN THE battle contains 100 or more active units, THE Battle_Performance_System SHALL maintain a minimum frame rate of 30 FPS on hardware meeting minimum specifications
2. WHILE THE battle is active, THE Battle_Performance_System SHALL update only entities within the camera frustum at full rate
3. WHILE THE battle is active, THE Battle_Performance_System SHALL throttle update frequency for entities beyond 100 meters from the camera
4. WHEN THE battle unit count exceeds 150, THE Battle_Performance_System SHALL reduce particle effect density by 50 percent
5. WHEN THE frame time exceeds 33 milliseconds, THE Battle_Performance_System SHALL scale animation update distance progressively
6. THE Battle_Performance_System SHALL measure and log frame time distribution for battles exceeding 80 units

### Requirement 4: Diplomacy Interface Visual Stability

**User Story:** As a player, I want the diplomacy screen to display correctly when opened from map mode, so that I can view and manage relationships

#### Acceptance Criteria

1. WHEN THE player opens the diplomacy interface from map mode, THE Diplomacy_UI SHALL display all kingdom banners with correct positioning
2. WHEN THE player opens the diplomacy interface from map mode, THE Diplomacy_UI SHALL render relationship lines without visual artifacts
3. WHEN THE diplomacy interface is visible, THE Diplomacy_UI SHALL maintain stable layout regardless of prior camera angle
4. WHEN THE player closes the diplomacy interface, THE game SHALL restore the map camera state without visual glitches
5. IF THE diplomacy interface rendering fails, THEN THE Diplomacy_UI SHALL log the error and close gracefully without freezing

### Requirement 5: Workshop Acquisition Rules (Bannerlord Accurate)

**User Story:** As a player, I want workshop acquisition to follow Bannerlord rules, so that I can purchase multiple workshops per city based on clan tier, matching actual game mechanics

**Research Sources:**
- [Mount & Blade Wiki - Workshop](https://mountandblade.fandom.com/wiki/Workshop): "The player can buy a workshop by entering the city and talking to a shop worker. The cost depends on the prosperity of the town."
- [Mount & Blade Wiki - Clan](https://mountandblade.fandom.com/wiki/Clan): "+1 Workshop limit (2 max)" at specific clan tiers
- [Steam Discussion - Multiple Workshops](https://steamcommunity.com/app/261550/discussions/0/2144217924387419884/): "You can have more than 1 per city. But the overall amount of workshops you can have is limited by your clan level."

#### Acceptance Criteria

1. WHEN THE player interacts with a workshop in any settlement, THE Workshop_System SHALL allow purchase if the player has not reached the clan tier workshop limit
2. WHERE THE player clan tier is 1, THE Workshop_System SHALL allow a maximum of 1 workshop across all settlements
3. WHERE THE player clan tier is 2 or higher, THE Workshop_System SHALL allow a maximum of 2 workshops across all settlements
4. THE Workshop_System SHALL allow purchasing multiple workshops in the same settlement if total count remains within clan tier limits
5. WHEN THE player attempts to purchase a workshop exceeding their clan tier limit, THE Workshop_System SHALL display a message stating the clan tier requirement
6. WHEN THE player purchases a workshop, THE Workshop_System SHALL charge denars equal to the settlement prosperity multiplied by 15

### Requirement 6: Lord Recruitment Behavior (Bannerlord Accurate)

**User Story:** As a player, I want AI lords to recruit troops realistically, so that they visibly stop at settlements to gather forces instead of instantly gaining troops while moving

**Research Sources:**
- [Steam Discussion - AI Recruitment](https://steamcommunity.com/app/261550/discussions/0/2144218528828172989/): "The A.I. gets soldiers in a different way than the player, in the sense that it does not have to physically go to villages to get recruits"
- [Steam Discussion - Rapid Recruitment](https://steamcommunity.com/app/261550/discussions/0/2248930420024659334/): "They are then able to recruit rapidly from villages/towns since they sort of have cheated max relationship with most notables of their faction."
- [Steam Discussion - Garrison Recruitment](https://steamcommunity.com/app/261550/discussions/0/6039921111962570229/): "Your fief sends out a party to recruit from nearby villages, based on the configurable garrison size."

#### Acceptance Criteria

1. WHEN THE Lord_AI_Recruitment determines a lord needs troops, THE lord party SHALL move to the nearest friendly settlement within 50 kilometers
2. WHEN THE lord party reaches a recruiting settlement, THE Lord_AI_Recruitment SHALL halt party movement for a duration equal to 4 hours plus 1 hour per 10 troops recruited
3. WHILE THE lord is recruiting at a settlement, THE lord party SHALL remain stationary on the campaign map
4. WHEN THE lord completes recruitment, THE Lord_AI_Recruitment SHALL add troops to the lord roster based on settlement notable relationships
5. WHEN THE lord has fewer than 30 troops, THE Lord_AI_Recruitment SHALL prioritize recruitment behavior over other objectives
6. THE Lord_AI_Recruitment SHALL allow recruiting higher-tier troops if the lord owns the settlement or has relations above 50 with its notables

### Requirement 7: Map Faction Color Coding (Bannerlord Accurate)

**User Story:** As a player, I want hostile parties to display in red on the map when I join a faction or become a mercenary, so that I can identify threats at a glance matching Bannerlord's visual system

**Research Sources:**
- [Nexus Mod - Blue Allies](https://www.nexusmods.com/mountandblade2bannerlord/mods/11505): "Vanilla Bannerlord only colors settlements with two relation states: your own kingdom (green) and your enemies (red). Everyone else — including kingdoms you've signed a formal alliance with — looks identical to total strangers."
- [Fandom - Factions](https://mountandblade.fandom.com/wiki/Factions_(Bannerlord)): "A freelance player may hire themselves [...] as a sellsword party [...] which will be color-coded to the player's custom banner from character creation."

#### Acceptance Criteria

1. WHEN THE player joins a kingdom as vassal, THE Map_Color_System SHALL render all enemy kingdom settlements in red
2. WHEN THE player joins a kingdom as vassal, THE Map_Color_System SHALL render all enemy lord parties in red
3. WHEN THE player becomes a mercenary for a kingdom, THE Map_Color_System SHALL render the employer kingdom settlements in green
4. WHEN THE player becomes a mercenary for a kingdom, THE Map_Color_System SHALL render kingdoms at war with the employer in red
5. WHEN THE player is independent, THE Map_Color_System SHALL render settlements in neutral gray
6. WHEN THE player is independent, THE Map_Color_System SHALL render bandit parties in dark red
7. THE Map_Color_System SHALL update all party and settlement colors within 100 milliseconds of relationship changes

### Requirement 8: Siege Garrison Positioning (Bannerlord and Warband Accurate)

**User Story:** As a player, I want siege mechanics to position defenders correctly, so that garrison lords appear inside fortifications or in relief positions outside matching historical Mount & Blade behavior

**Research Sources:**
- [Warband Steam Discussion - Defending Sieges](https://steamcommunity.com/app/48700/discussions/0/41973821065901019/): "Go into the place being besieged and wait for the battle to start. Works even in neutral fiefs so long as you are enemies with the attacking side. Alternatively, wait for the actual fighting to start, then go to the fief to join in. Sometimes this is a better option since nearby friendly lords will usually rush to help with the defense once they see the battle already going."
- [Warband Fandom - Sieges](https://mountandblade.fandom.com/wiki/Sieges): "If you do not want to assault it directly, you will have to wait until the residents surrender, usually from starvation (30 days in a castle and 100 days in a town)."
- [Warband Discussion - Garrison Strength](https://steamcommunity.com/app/48700/discussions/0/1519260397783063406/): "Defender strength is below 200 and attacker strength is at least 3 times the defender's."

#### Acceptance Criteria

1. WHEN THE settlement is under siege, THE Siege_Mechanic SHALL position the garrison lord party inside the settlement boundaries on the campaign map
2. WHEN THE player approaches a besieged settlement to within 5 kilometers, THE Siege_Mechanic SHALL display the garrison lord party icon overlaid on the settlement icon
3. WHEN THE siege begins, THE Siege_Mechanic SHALL include garrison lord troops in the defender force composition
4. WHEN THE friendly lord party approaches a besieged friendly settlement, THE Siege_Mechanic SHALL position the relief force outside the siege perimeter
5. WHEN THE siege assault starts with relief forces present, THE Siege_Mechanic SHALL spawn relief forces on the defender side after 60 seconds of combat
6. IF THE garrison strength is below 200 and attacker strength exceeds garrison by 3 times, THEN THE Siege_Mechanic SHALL offer immediate surrender
7. WHEN THE siege lasts 30 days for castles or 100 days for towns without supply, THE Siege_Mechanic SHALL trigger automatic surrender

### Requirement 9: Lord Party Information Display (Bannerlord Accurate)

**User Story:** As a player, I want comprehensive lord party information when hovering over them, so that I can assess threat level, behavior, and composition matching Bannerlord's ALT-key tooltip system

**Research Sources:**
- [Steam Discussion - ALT Key](https://steamcommunity.com/app/261550/discussions/0/2264689848039122716/?l=english): "the ALT key highlights enemy formations and dropped weapons in battle and POI in cities/towns, it also shows detail information on parties on the overworld"
- [Nexus Mod - Party Sorted Tooltip](https://www.nexusmods.com/mountandblade2bannerlord/mods/512): "Get the party description tooltip sorted by unit number in descending order, allowing for better readability, and ease of use."

#### Acceptance Criteria

1. WHEN THE player holds ALT key and hovers over a lord party, THE Lord_Hover_Tooltip SHALL display lord name and clan
2. WHEN THE player holds ALT key and hovers over a lord party, THE Lord_Hover_Tooltip SHALL display total troop count
3. WHEN THE player holds ALT key and hovers over a lord party, THE Lord_Hover_Tooltip SHALL display troop composition sorted by unit count descending
4. WHEN THE player holds ALT key and hovers over a lord party, THE Lord_Hover_Tooltip SHALL display current party behavior (patrolling, raiding, defending, recruiting)
5. WHEN THE player holds ALT key and hovers over a lord party, THE Lord_Hover_Tooltip SHALL display party speed with modifiers breakdown
6. WHEN THE player holds ALT key and hovers over a lord party, THE Lord_Hover_Tooltip SHALL display morale and food days remaining
7. WHEN THE player holds ALT key and hovers over an enemy lord party, THE Lord_Hover_Tooltip SHALL display estimated party strength relative to player
8. THE Lord_Hover_Tooltip SHALL update information within 50 milliseconds of hovering

### Requirement 10: Code Architecture Modularization

**User Story:** As a developer, I want a modular and maintainable codebase structure, so that systems can be modified independently without cascading failures

**Research Sources:**
- [Dev.to - Modular PHP Benefits](https://dev.to/navneet_verma/the-hidden-benefits-of-modular-php-how-to-build-scalable-applications-like-a-pro-1f6l): "Modular architecture not only promotes a clear separation of concerns but also empowers developers to work in parallel. Each module can be developed, tested, and deployed independently."
- [Medium - Clean Code Game Development](https://niraj-vishwakarma.medium.com/clean-code-and-architecture-for-game-development-d43e42999ec9): "game architecture is required for better project management in game development because it brings structure, organization, and efficiency to the development process."
- [GitHub - Node Best Practices](https://github.com/goldbergyoni/nodebestpractices/blob/master/README.md): "The root of a system should contain folders or repositories that represent reasonably sized business modules. Each component represents a product domain (i.e., bounded context), like 'user-component', 'order-component', etc."

#### Acceptance Criteria

1. THE Code_Architecture SHALL organize source files into domain-based modules (campaign, battle, ui, character, economy)
2. THE Code_Architecture SHALL ensure each module exposes a single public interface file
3. THE Code_Architecture SHALL limit inter-module dependencies to explicit imports through public interfaces
4. WHEN THE a module is modified, THE Code_Architecture SHALL allow testing the module independently without initializing unrelated systems
5. THE Code_Architecture SHALL separate data structures from behavior logic in distinct files
6. THE Code_Architecture SHALL define clear data flow direction (campaign → simulation → ui, never ui → campaign)
7. THE Code_Architecture SHALL maintain cyclic dependency count at zero between domain modules

### Requirement 11: Battle Terrain Mesh Integrity

**User Story:** As a player, I want soldiers to stand on terrain correctly during battles, so that units do not clip underground or float above the ground

**Research Sources:**
- [Steam Discussion - Unit Collision](https://steamcommunity.com/app/261550/discussions/0/3057365873432567230/): "I've never seen units clipping into each other, at least not anything worth remarking on. They reduced collision hull size early in EA to prevent players from getting stuck on them in combat/sieges."
- [Steam Discussion - Terrain Settings](https://steamcommunity.com/app/261550/discussions/0/695371826099010630/): "You could try lowering the 'Grass and Foliage Quality' settings to the minimum and then further down to the 'Terrain Detail' settings, setting them to medium, but not to minimum..."

#### Acceptance Criteria

1. WHEN THE Terrain_Rendering generates battle terrain mesh, THE system SHALL ensure mesh vertices align to a consistent ground plane
2. WHEN THE battle simulation spawns a unit, THE system SHALL raycast downward to find terrain height at unit position
3. WHEN THE unit moves, THE Terrain_Rendering SHALL update unit vertical position to match terrain height every 100 milliseconds
4. IF THE raycast fails to find terrain, THEN THE Terrain_Rendering SHALL place unit at default ground height (y=0)
5. WHEN THE terrain mesh contains steep slopes, THE Terrain_Rendering SHALL limit mesh polygon angles to 45 degrees maximum
6. THE Terrain_Rendering SHALL generate collision geometry matching visual terrain mesh within 10 centimeters tolerance
7. THE Terrain_Rendering SHALL validate mesh integrity on generation and log errors if vertices fall outside battle bounds
