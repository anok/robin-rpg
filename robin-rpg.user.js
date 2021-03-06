// ==UserScript==
// @name         Robin rpg bot
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  rpg bot for reddit robin ;3 based on /u/npinsker trivia bot
// @author       /u/anokrs
// @include      https://www.reddit.com/robin*
// @require      http://ajax.googleapis.com/ajax/libs/jquery/2.0.0/jquery.min.js
// @require      https://raw.githubusercontent.com/anok/robin-rpg/master/db.js
// @updateURL    https://github.com/napstr/robin-rpg/raw/master/robin-rpg.user.js
// ==/UserScript==

/* jshint esnext: true */
(function() {

    var MAX_MESSAGE_LENGTH = 140;
    var TIME_PER_QUEST = 35000;
    var TIME_PER_BREAK = 20000;
    var RETRY_CONNECT = 2000;
    var NUM_COMMANDS = 3;
    var COMMANDS_TIMEOUT = 6000;

    var QUESTS_PER_SCORE_DISPLAY = 10;
    //var NUM_SCORES_TO_DISPLAY = 15;

    var NUM_TO_FLEE = 6;

    var FILTER_CHANNEL = true;
    var FILTER = "#rpg";
    var USER_NAME = "robin-rpg";

    var SCORE_SAVE_STRING = "robin-rpg-scores";
    var LOOT_SAVE_STRING = "robin-rpg-loot";
    var GUILD_SAVE_STRING = "robin-rpg-guild";
    var BANLIST_SAVE_STRING = "robin-rpg-banlist";
    var ADMINS_SAVE_STRING = "robin-rpg-admins";

    var GUILD_NAME_LENGTH = 8;
    var GUILD_COST = 5;

    var BAN_LIST = [];
    var ADMINS = ["anokrs", "npst0r"];

    var RAID_GOING_ON = false;
    var RAID_LENGTH = 300000; //5 mins
    var RAID_COOLDOWN = 600000; // 10 mins; a guild can start a raid only every 10 minutes, so there is a chance to retaliate for the other guild


    var _q = [];
    var _l = [];
    var _hpmul = 3.0;
    var _quest_num = 1;
    var _num_commands = NUM_COMMANDS;
    //var _additional_pause = 0;
    var _round = {};
    var _runaway = 0;
    var _monsters;
    var _scores = { };
    var _loot = {};
    var _guilds = {};
    var _raid = {};

    function parseMonsters(monstersDb) {
        function Monster(name, hp) {
            this.name = name;
            this.hp = hp;
        }
        _monsters = monstersDb.split(',');
        for(var i = 0; i < _monsters.length; i += 2) {
            _q.push(new Monster(_monsters[i], _monsters[i+1]));
        }
    }

    function parseLoot(lootDb) {
        var arr = lootDb.split(',');
        for(var i = 0; i < arr.length; i += 2) {
            _l.push(arr[i]);
        }
    }

    function generateLoot() {
        var a = Math.floor(Math.random() * (_l.length));
        while(_l[a] === undefined) {
            a = Math.floor(Math.random() * (_l.length));
        }
        return a;
    }

    function addLoot(user, lootstr) {
        if (_scores[user] === undefined) {
            _scores[user] = [0, 0, ""];
        }
        _scores[user][1] += 1;

        _loot[user] = lootstr;
    }

    //loads players scores
    function loadScores() {
        var scoresText = localStorage[SCORE_SAVE_STRING];
        if (scoresText) {
            _scores = JSON.parse(scoresText);
            for (var user in _scores) {
                var data = _scores[user];
                if(typeof data === 'number') {
                    _scores[user] = [data, 0];
                }
            }
        }
        else {
            _scores = { };
        }
        return _scores;
    }

    //loads players loot
    function loadLoot() {
        var lootText = localStorage[LOOT_SAVE_STRING];
        if (lootText) {
            _loot = JSON.parse(lootText);
        }
        else {
            _loot = { };
        }
        return _loot;
    }

    //loads the banlist
    function loadBanlist() {
        var banlistText = localStorage[BANLIST_SAVE_STRING];
        if(banlistText) {
            BAN_LIST = JSON.parse(banlistText);
        } else {
            BAN_LIST = [];
        }
        return BAN_LIST;
    }

    //loads the admins
    function loadAdmins() {
        var adminsText = localStorage[ADMINS_SAVE_STRING];
        if(adminsText) {
            ADMINS = JSON.parse(adminsText);
        }
        return ADMINS;
    }

    function loadGuilds() {
        var guildsText = localStorage[GUILD_SAVE_STRING];
        if(guildsText) {
            _guilds = JSON.parse(guildsText);
        }
        else {
            _guilds = { };
        }
    }
    function saveGuilds(guilds) {
        localStorage[GUILD_SAVE_STRING] = JSON.stringify(guilds);
    }
    function saveLoot(loot) {
        localStorage[LOOT_SAVE_STRING] = JSON.stringify(loot);
    }

    function saveScores(scores) {
        localStorage[SCORE_SAVE_STRING] = JSON.stringify(scores);
    }

    function saveBanList(banlist) {
        localStorage[BANLIST_SAVE_STRING] = JSON.stringify(banlist);
    }

    function saveAdmins(admins) {
        localStorage[ADMINS_SAVE_STRING] = JSON.stringify(admins);
    }

    function computeLevel(xp) {
        return Math.floor(((Math.sqrt(625 + 100 * xp) - 25) / 50));
    }

    function computeLevelGuild(xp) {
        return Math.floor(((Math.sqrt(25 + 20 * xp) - 5) / 10));
    }

    function readXp(user) {
        if (_scores[user] === undefined) {
            _scores[user] = [0, 0, ""];
        }
        return _scores[user][0];
    }

    function readGuildXp(guild) {
        if(_guilds[guild] === undefined){
            return 0;
        }
        return _guilds[guild][0];
    }

    function readLootAmount(user) {
        if(_scores[user] === undefined) {
            _scores[user] = [0,0, ""];
        }
        return _scores[user][1];
    }

    function readLootItems(user) {
        if (_loot[user] === undefined) {
            _loot[user] = "";
        }
        return _loot[user];
    }

    function userInfoLvl(user) {
        //Return xp/lvl.
        var xp = readXp(user);
        var level = computeLevel(xp);
        var nextLevel = level + 1;
        var levelTarget = (25*level*(1+level));
        var nextLevelTarget = (25*nextLevel*(1+nextLevel));
        var nextLevelPercent = ((xp - levelTarget) * 100) / (nextLevelTarget - levelTarget);
        var guild = readGuild(user);
        var guildBadge = "";
        if(guild.length > 0) {
            guildBadge = "[" + guild.substring(0,3) + "]";
        }
        nextLevelPercent =Math.round(nextLevelPercent);
        return guildBadge + user + " (" + ((xp !== null ? level + 1 : "0") + "/" + nextLevelPercent + "%") + ")";
    }

    function guildInfoLvl(guild) {
        //Return xp/lvl.
        var xp = readGuildXp(guild);
        var level = computeLevelGuild(xp);
        var nextLevel = level + 1;
        var levelTarget = (5*level)*(1+level);
        var nextLevelTarget = (5*nextLevel*(1+nextLevel));
        var nextLevelPercent = ((xp - levelTarget) * 100) / (nextLevelTarget - levelTarget);
        nextLevelPercent = Math.round(nextLevelPercent);
        return "[" + guild + "(" + ((xp !== null ? level + 1 : "0") + "/" + nextLevelPercent + "%") + ")]";
    }



    function readGuild(user) {
        var _user = _scores[user];
        if(_user[2] === undefined) {
            _scores[user][2] = "";
        }
        return _scores[user][2];
    }

    function userInfoXp(user, xp) {
        //Return xp.
        var guild = readGuild(user);
        var guildBadge = "";
        if(guild.length > 0) {
            guildBadge = "[" + guild.substring(0,3) + "]";
        }
        return guildBadge + user + " (" + (xp !== null ? Math.round(xp) : "0") + ")";
    }

    function computeTopScoresStr(scores, num) {
        var scoresArray = [ ];
        for (var user in scores) {
            if(BAN_LIST.indexOf(user) === -1) {
                scoresArray.push([user, readXp(user)]);
            }
        }
        scoresArray.sort(function(a, b) { return -(a[1] - b[1]); });
        var buildScores = FILTER + " HEROES : ";
        buildScores += scoresArray.map(i => userInfoLvl(i[0])).slice(0, num).join(", ");
        return buildScores;
    }

    function computeTopGuildsStr(guilds, num) {
        var scoresArray = [ ];
        for (var guild in guilds) {
            scoresArray.push([guild, guilds[guild][0]]);
        }
        scoresArray.sort(function(a, b) { return -(a[1] - b[1]); });
        var buildScores = FILTER + " GUILDS: ";
        buildScores += scoresArray.map(i => guildInfoLvl(i[0])).slice(0, num).join(", ");
        return buildScores;
    }

    /**
     * Shuffles array in place.
     * @param {Array} a items The array containing the items.
     * Taken verbatim from
     * http://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array-in-javascript.
     */
    function shuffle(a) {
        var j, x, i;
        for (i = a.length; i; i -= 1) {
            j = Math.floor(Math.random() * i);
            x = a[i - 1];
            a[i - 1] = a[j];
            a[j] = x;
        }
    }

    //function getAdditionalPause() {
    //    if (_additional_pause > 0) {
    //        var toReturn = _additional_pause;
    //        _additional_pause = 0;
    //        return toReturn;
    //    }
    //    return 0;
    //}

    function sendMessage(message) {
        var truncated_message = message;
        if (truncated_message.length > MAX_MESSAGE_LENGTH) {
            truncated_message = truncated_message.substr(0, MAX_MESSAGE_LENGTH-3) + "...";
        }
        unsafeWindow.$(".text-counter-input").val(truncated_message).trigger("submit");
    }
    function printQuest(index) {
        sendMessage(FILTER+" A wild " + _q[index].name + " appeared! HP: " + Math.round(_q[index].hp * _hpmul) + "[⬛⬛⬛⬛⬛]! Attack it by chatting! (you can !flee and get !help)! Check out the !commands.");
    }

    function renderHP(hp, hptotal) {
        var hp_bar = Math.round(hp) + "[";
        var hp_percent = (hp*100/hptotal);
        for(var i = 0; i < 5; i++) {
            if(hp_percent > i*20) {
                hp_bar += "⬛";//full
            } else {
                hp_bar += "⬜";//empty
            }
        }
        hp_bar += "]";
        return hp_bar;

    }

    function pullNewCommands() {
        var re = [];
        $('.robin-message--message:not(.addon--comm)').each(function() {
            var user = $('.robin-message--from', $(this).closest('.robin-message')).text();
            re.push([user, $(this).text()]);
            $(this).addClass('addon--comm');
        });

        return re;
    }

    function filterMessage(_user, _msg) {
        if(_user == USER_NAME) {
            //Plugin to moderation? TO-DO.
            return true;
        }

        if(BAN_LIST.indexOf(_user) !== -1 && ADMINS.indexOf(_user) === -1) {
            return true;
        }
        if(_user == "[robin]") {
            return true;
        }
        if(_user === "") {
            return true;
        }
        if(_msg.length <= 2) {
            return true;
        }

        //only read FILTER;
        if(FILTER_CHANNEL) {
            if(_msg.substring(0,4) !== FILTER) {
                return true;
            }
        }

        //only read ascii
        var regexp = /[^\x00-\x7F]/g;
        if(regexp.exec(_msg)) {
            return true;
        }

        //dont read text bombs
        var regexp_bombs = /([\x00-\x7F])\1{8,}/g;
        if(regexp_bombs.exec(_msg)) {
            return true;
        }

        var regexp_repetition = /([\x00-\x7F]{3,})\1{5,}/g;
        if(regexp_repetition.exec(_msg)) {
            return true;
        }

        return false;
    }

    function listCommands(commands) {
        var commandsList = [];

        for (var i=0; i<commands.length; ++i) {
            var _user = commands[i][0];
            var _msg = commands[i][1];

            if(filterMessage(_user, _msg) === true) {
                continue;
            }
            if(_msg.includes("!party")) {
                commandsList.push(["!party", _user]);
                continue;
            }

            if(_msg.includes("!loot")) {
                commandsList.push(["!loot", _user]);
                continue;
            }

            if(_msg.includes("!commands")) {
                commandsList.push(["!commands", _user]);
                continue;
            }

            if(_msg.includes("!heroes")) {
                commandsList.push(["!heroes", _user]);
                continue;
            }

            if(_msg.includes("!help")) {
                commandsList.push(["!help", _user]);
                continue;
            }

            if(_msg.includes("!commands")) {
                commandsList.push(["!commands", _user]);
                continue;
            }

            //BAN_LIST and ADMINS system
            var pos = FILTER.length + 2;
            if(_msg.substring(0, pos) === FILTER + " !") {
                if(_msg.substring(pos, pos+"ban ".length) === "ban ") {
                    pos += "ban ".length;
                    commandsList.push(["!ban", _user, _msg.substring(pos)]);
                    continue;
                }

                if(_msg.substring(pos, pos+"unban ".length) === "unban ") {
                    pos += "unban ".length;
                    commandsList.push(["!unban", _user, _msg.substring(pos)]);
                    continue;
                }

                if(_msg.substring(pos, pos+"banlist".length) === "banlist") {
                    pos += "banlist".length + 1;
                    commandsList.push(["!banlist", _user]);
                    continue;
                }

                if(_msg.substring(pos, pos+"promote".length) === "promote") {
                    pos += "promote ".length;
                    commandsList.push(["!promote", _user, _msg.substring(pos)]);
                    continue;
                }

                if(_msg.substring(pos, pos+"demote".length) === "demote") {
                    pos += "demote ".length;
                    commandsList.push(["!demote", _user, _msg.substring(pos)]);
                    continue;
                }

                if(_msg.substring(pos, pos+"admins".length) === "admins") {
                    pos += "admins".length + 1;
                    commandsList.push(["!admins", _user]);
                    continue;
                }

                if(_msg.substring(pos, pos+"deleteuser".length) === "deleteuser") {
                    pos += "deleteuser ".length;
                    commandsList.push(["!deleteuser", _user, _msg.substring(pos)]);
                    continue;
                }
            }

            //GUILD COMMAND SUB-SYSTEM
            //only accepts messages that starts with the command
            var pos = FILTER.length + 2;
            if(_msg.substring(0, pos) === FILTER + " !") {
                if(_msg.substring(pos, pos+"create".length) === "create") {
                    pos += "create".length + 1;
                    commandsList.push(["!create", _user, _msg.substring(pos)]);
                    continue;
                }

                if(_msg.substring(pos, pos+"join".length) === "join") {
                    pos += "join".length + 1;
                    commandsList.push(["!join", _user, _msg.substring(pos, pos+GUILD_NAME_LENGTH)]);
                    continue;
                }

                if(_msg.substring(pos, pos+"deposit".length) === "deposit") {
                    pos += "deposit".length + 1;
                    commandsList.push(["!deposit", _user, _msg.substring(pos)]);
                    continue;
                }

                if(_msg.substring(pos, pos+"depall".length) === "depall") {
                    pos += "depall".length + 1;
                    commandsList.push(["!depall", _user]);
                    continue;
                }

                if(_msg.includes("!guilds")) {
                    commandsList.push(["!guilds", _user]);
                    continue;
                }
            }

            //RAID COMMANDS
            var pos = FILTER.length + 2;
            if (_msg.substring(0, pos) === FILTER + " !") {
                if (_msg.substring(pos, pos+"raid".length) === "raid") {
                    pos += "raid".length + 1;
                    commandsList.push(["!raid", _user, _msg.substring(pos)]);
                    continue;
                }
            }

            if (_msg.substring(0, pos) === FILTER + " !") {
                if (_msg.substring(pos, pos+"attack".length) === "attack") {
                    pos += "attack".length + 1;
                    commandsList.push(["!attack", _user]);
                    continue;
                }
            }

            if (_msg.substring(0, pos) === FILTER + " !") {
                if (_msg.substring(pos, pos+"defend".length) === "defend") {
                    pos += "defend".length + 1;
                    commandsList.push(["!defend", _user]);
                    continue;
                }
            }

        }

        return commandsList;
    }

    function replyCommand() {
        setTimeout(function() {
            var commands = pullNewCommands();
            var commandMessage = FILTER+" ";
            var commandsList = listCommands(commands);
            if(commandsList.length > 0) {
                var command = commandsList[0][0];
                var command_user = commandsList[0][1];
                var command_guild;
                switch(command) {
                    case "!loot":
                        var _lootAmount = readLootAmount(command_user);
                        if(_lootAmount > 0) {
                            commandMessage += command_user + " bag of holding contains " + _lootAmount + " shiny things! ";
                            var _lootName = readLootItems(command_user);
                            if(_lootName.length > 0) {
                                commandMessage += "A [" + _lootName + "] surfaces in it...";
                            } else {
                                commandMessage += "Nothing is visible inside... ";
                            }
                        } else {
                            commandMessage += command_user + " bag of holding is currently empty! It contains 0 shiny things!";
                        }
                        break;
                    case "!party":
                        commandMessage += assembleParty(command_user);
                        break;
                    case "!heroes":
                        commandMessage += computeTopScoresStr(_scores, 15);
                        break;
                    case "!help":
                        commandMessage += "Each line deals damage, which is based on your level and your loot. More info: https://github.com/anok/robin-rpg";
                        break;
                    case "!commands":
                        commandMessage += "!loot checks your belongings, !heroes check the hall of fame, !party check your level, !flee runs away.";
                        break;

                    case "!ban":
                        if (ADMINS.indexOf(command_user) > -1) {
                            var userbanned = commandsList[0][2];

                            if (BAN_LIST.indexOf(userbanned) > -1) {
                                commandMessage += "User " + userbanned + " is already banned.";
                            } else {
                                commandMessage += "User " + userbanned + " banned from playing by " + command_user + "!";
                                BAN_LIST.push(userbanned);
                                saveBanList(BAN_LIST);
                            }
                        }
                        break;

                    case "!unban":
                        if (ADMINS.indexOf(command_user) > -1) {
                            var userunbanned = commandsList[0][2];
                            var banlistIndex = BAN_LIST.indexOf(userunbanned);
                            if (banlistIndex == -1) {
                                commandMessage += "User " + userunbanned + " is not banned.";
                            } else {
                                commandMessage += "User " + userunbanned + " unbanned by " + command_user + "!";
                                BAN_LIST.splice(banlistIndex, 1);
                                saveBanList(BAN_LIST);
                            }
                        }
                        break;

                    case "!banlist":
                        if (ADMINS.indexOf(command_user) > -1) {
                            commandMessage += " banlist: ";
                            if (BAN_LIST.length == 0) {
                                commandMessage += "is empty";
                            }
                            for (var i = 0; i < BAN_LIST.length; i++)
                                commandMessage += BAN_LIST[i] + " ";
                        }
                        break;

                    case "!demote":
                        if (ADMINS.indexOf(command_user) > -1) {
                            var demotedUser = commandsList[0][2];
                            var adminIndex = ADMINS.indexOf(demotedUser);
                            if (adminIndex === -1) {
                                commandMessage += "User " + demotedUser + " is not an admin.";
                            } else {
                                commandMessage += "User " + demotedUser + " demoted by " + command_user + "!";
                                ADMINS.splice(adminIndex, 1);
                                saveAdmins(ADMINS);
                            }
                        }
                        break;

                    case "!promote":
                    if (ADMINS.indexOf(command_user) > -1) {
                        var promotedUser = commandsList[0][2];

                        if (ADMINS.indexOf(promotedUser) > -1) {
                            commandMessage += "User " + promotedUser + " is already admin.";
                        } else {
                            commandMessage += "User " + promotedUser + " promoted to admin by " + command_user + "!";
                            ADMINS.push(promotedUser);
                            saveAdmins(ADMINS);
                        }
                    }
                    break;

                    case "!admins":
                        if (ADMINS.indexOf(command_user) > -1) {
                            commandMessage += " admins: ";
                            if (ADMINS.length == 0) {
                                commandMessage += "is empty";
                            }
                            for (var i = 0; i < ADMINS.length; i++)
                                commandMessage += ADMINS[i] + " ";
                        }
                        break;

                    case "!deleteuser":
                        if (ADMINS.indexOf(command_user) > -1) {
                            delete _scores[commandsList[0][2]];
                            commandMessage += " user " + commandsList[0][2] + " deleted";
                            saveScores(_scores);
                        }
                        break;

                    case "!join": // DONE
                        command_guild = commandsList[0][2];
                        commandMessage += joinGuild(command_user, command_guild);
                        break;
                    case "!create":
                        command_guild = commandsList[0][2];
                        commandMessage += createGuild(command_user, command_guild);
                        break;
                    case "!deposit":
                        command_guild = commandsList[0][2];
                        commandMessage += depositGuild(command_user, command_guild);
                        break;
                    case "!depall":
                        commandMessage += depositGuild(command_user, "all");
                        break;
                    case "!guilds":
                        commandMessage += computeTopGuildsStr(_guilds, 15);
                        break;

                    case "!raid":
                        var attacked_guild = commandsList[0][2];
                        commandMessage += raidGuild(command_user, attacked_guild);
                        break;

                    case "!attack":
                        commandMessage += raidAttack(command_user);
                        break;

                    case "!defend":
                        commandMessage += raidDefend(command_user);
                        break;
                }
                if(commandMessage.length > FILTER.length + " ") {
                    sendMessage(commandMessage);
                }
            }
            if(_num_commands > 0) {
                _num_commands--;
                replyCommand();
            }
        }, COMMANDS_TIMEOUT);
    }

    function raidGuild(user, defGuildName) {
        var reply = "";

        //check all prerequisites for a raid
        if (RAID_GOING_ON) return true; //TODO message what raid is going on

        if (_scores[user] === undefined) {
            _scores[user] = [0,0, ""]; //TODO message user has no guild
            return true;
        } else if (_scores[user][2] === undefined) {
            _scores[user][2] = ""; //TODO message user has no guild
            return true;
        }
        var attGuildName = _scores[user][2];

        if (_guilds[defGuildName] === undefined) {
            //TODO attacked guild does not exist
            return true;
        }

        //has defending guild loot that can be stolen?
        if (_guilds[defGuildName][0] < 1) {
            //TODO attacked guild has not enough loot
            return true;
        }

        //attacking guild on cooldown?
        if (_guilds[attGuildName][3] === undefined) _guilds[attGuildName][3] = 0;
        if (_guilds[attGuildName][3] + RAID_COOLDOWN > ((new Date()).getTime())) {
            //TODO msg guild is on cd
            return true;
        }

        //raid can start
        RAID_GOING_ON = true;
        _raid = {};
        _raid["attackingGuild"] = _scores[user][2];
        _raid["defendingGuild"] = defGuildName;
        _raid["attackers"] = [];
        _raid["defenders"] = [];

        _raid["attackers"].push(user);
        _guilds[attGuildName][3] = new Date().getMilliseconds();

        //TODO msg about raid starting

        setTimeout(function() {

            //TODO calculations based on attackers, defenders and overall vaults of the guilds
            //magic happens
            //the strength is the amount of the loot of the enemy
            // + base attacker/defender dmg is 10
            // + bonus 10% overall extra strength per attacker/defender
            var attAmount = _raid["attackers"].length;
            var attGuild = _raid["attackingGuild"];
            var defAmount = _raid["defenders"].length;
            var defGuild = _raid["defendingGuild"];
            var attStrength = (_guilds[defGuild][0] + attAmount * 10) * (1.1 * attAmount);
            var defStrength = (_guilds[attGuild][0] + defAmount * 10) * (1.1 * defAmount);

            var threshold = attStrength / (attStrength + defStrength);
            if (Math.random() <= threshold) {
                //attackers win
                //TODO msg
                _guilds[defGuild][0] -= 1;
                _guilds[attGuild][0] += 1;
            } else {
                //TODO msg the raid has failed
            }

            RAID_GOING_ON = false;
        }, RAID_LENGTH);
    }

    function raidAttack(user) {
        if (!RAID_GOING_ON) {
            //TODO msg no raid going on, start one with !raid [guild]
            return true;
        }
        if (_scores[user][2] === _raid["attackingGuild"]) {
            _raid["attackers"].push(user);
            //TODO msg user participating in attack
        } else {
            //TODO msg user your guild is not attacking, try !defend or start !raid
        }
    }

    function raidDefend(user) {
        if (!RAID_GOING_ON) {
            //TODO msg no raid going on, start one with !raid [guild]
            return true;
        }
        if (_scores[user][2] === _raid["defendingGuild"]) {
            _raid["defenders"].push(user);
            //TODO msg user participating in defense
        } else {
            //TODO msg user your guild is not defending, try !attack or start !raid
        }
    }

    function joinGuild(user, guild) {
        if (_scores[user] === undefined) {
            _scores[user] = [0,0, ""];
        } else if (_scores[user][2] === undefined) {
            _scores[user][2] = "";
        }
        if (guild.length <= 0) {
            return FILTER + " " + user + " can't join this guild!";
        }
        if(_guilds[guild] === undefined) {
            return user + ": this guild doesn't exist yet! Why don't you !create it?";
        }
        var currentGuild = _scores[user][2];
        var reply = "";
        if(currentGuild === "")
            reply = user + " joins [" + guild + "]! Your !deposit will count towards it's level.";
        else if (guild === currentGuild) {
            reply = user + " is already part of the glorious [" + guild + "]";
        }
        else {
            reply = user + " leaves [" + currentGuild + "] to join [" + guild + "]!";
        }
        _scores[user][2] = guild;
        saveScores(_scores);
        return reply;
    }

    function createGuild(user, guild) {
        if (_scores[user] === undefined) {
            _scores[user] = [0,0, ""];
        } else if (_scores[user][2] === undefined) {
            _scores[user][2] = "";
        }
        if (guild.length <= 0) {
            return user + " can't create a unnamed guild!";
        }
        var guildFullName = guild;

        if (guild.length > 8) {
            guild = guild.substring(0,8)
        }

        if(_guilds[guild] !== undefined) {
            return user + ": " + guildInfoLvl(guild) +" already exists! Why don't you !join it?";
        }

        var currentGuild = _scores[user][2];
        var currentLoot = readLootAmount(user);

        if(currentLoot < GUILD_COST) {
            return user + ": insufficient funds to build a guild hall and a vault! You need " + (5 - currentLoot) + " more loot.";
        }

        _scores[user][1] -= 5;
        _scores[user][2] = guild;
        _guilds[guild] = [5, user, guildFullName, 0];

        var reply = "";
        if(currentGuild === "")
            reply = user + " creates [" + guild + "]! Members can !deposit loot to the vault, to receive bonus XP!";
        else {
            reply = user + " leaves [" + currentGuild + "] to create [" + guild + "]!";
        }

        saveGuilds(_guilds);
        saveScores(_scores);

        return reply;
    }

    function depositGuild(user, amountStr) {
        if (_scores[user] === undefined) {
            _scores[user] = [0,0, ""];
        } else if (_scores[user][2] === undefined) {
            _scores[user][2] = "";
        }

        var currentGuild = _scores[user][2];
        var currentLoot = readLootAmount(user);

        var amount = parseInt(amountStr) || 1;
        if (amountStr === "all") amount = currentLoot;

        if(currentGuild === "") {
            return user + ": You currently are not in a guild. List the top ones in !guilds";
        }

        if(currentLoot === 0) {
            return user + ": You currently cannot contribute with " +  guildInfoLvl(currentGuild) + ", go kill something!";
        }

        if(amount > currentLoot) {
            return user + ": You don't have " + amount + " to deposit in " +  guildInfoLvl(currentGuild) + " vault!";
        }


        var reply = "";
        if(_guilds[currentGuild] !== undefined) {
            _scores[user][1] -= amount;
            _guilds[currentGuild][0] += amount;
            reply = user + " deposited " + amount + " loot in " + guildInfoLvl(currentGuild) + " vault!";
        }

        saveGuilds(_guilds);
        saveScores(_scores);

        return reply;
    }


    function assembleParty(user) {
        var reply = "THE PARTY: ";
        var partyPeople = _round.party;
        var guild = "";
        if(readGuild(user).length > 0) {
            guild = " from " + guildInfoLvl(readGuild(user));
        }
        if(partyPeople.length <= 1 && partyPeople[0][0] === user) {
            reply += userInfoLvl(user);
            reply += ", the lone wolf" + guild + ".";
        } else {
            reply += userInfoLvl(user) + guild;
            reply += " and... ";
            shuffle(partyPeople);
            partyPeople = partyPeople.slice(0,15);
            for(var i = 0; i < partyPeople.length; i++) {
                if(partyPeople[i][0] == user) {
                    partyPeople.splice(i, 1);
                    break;
                }
            }
            reply += partyPeople.map(i => userInfoLvl(i[0])).slice(0, 15).join(", ");
        }
        return reply;
    }
    function poseSingleQuest(index, timeout) {
        var hptotal = Math.floor(_q[index].hp * _hpmul);
        if(_round.num === 0) {
            printQuest(index);
            _round.hpleft = hptotal;
            _round.name = _q[index].name;
        } else {
            _round.dmg = 0;
        }
        _num_commands = NUM_COMMANDS;
        replyCommand();
        setTimeout(function() {
            _round.num++;
            var answers = pullNewAnswers();
            var usersScored = judgeAnswers(answers);
            var buildAnswerMessage = FILTER+" ";
            var runaway = false;
            if(_runaway >= NUM_TO_FLEE && (_round.hpleft*100/hptotal) > 70) {
                buildAnswerMessage += "You fled " +  _q[index].name + " and it's glorious loot of [" + _l[generateLoot()] + "]!";
                _round.hpleft = 0;
                _runaway = 0;
                runaway = true;
            }
            increaseScores(usersScored);
            saveScores(_scores);
            var usersArray = [];
            var user= "";
            if(_round.hpleft > 0) {
                //ROUND OVER
                var runawayMessage = "";
                if(_runaway > 0) {
                    if((_round.hpleft*100/hptotal) > 70) {
                        runawayMessage = " [" + _runaway + "/" + NUM_TO_FLEE +" to !flee]";
                    } else {
                        runawayMessage = " [can't flee!]";
                    }
                }
                buildAnswerMessage += "Round #" + _round.num + ", " + Math.round(_round.dmg) + " hits! " + _q[index].name + " HP: " + renderHP(_round.hpleft, hptotal) + runawayMessage + " +XP: ";
                for (user in usersScored) {
                    usersArray.push([user, usersScored[user]]);
                }
                usersArray.sort(function(a, b) { return -(a[1] - b[1]); });
                if(usersArray.length === 0) {
                    _runaway++;
                    buildAnswerMessage += "no one :(";
                }
                _round.party = usersArray.length > 0 ? usersArray : _round.party;
                buildAnswerMessage += usersArray.map(i => userInfoXp(i[0], i[1])).slice(0, 15).join(", ");
            } else if(runaway === false) {
                //BUILD KILL MONSTER
                for (user in usersScored) {
                    usersArray.push([user, usersScored[user]]);
                }
                usersArray.sort(function(a, b) { return -(a[1] - b[1]); });
                _round.party = usersArray;
                var loot = generateLoot();
                var lootPicker = Math.floor(Math.random()*_round.party.length);
                buildAnswerMessage += _q[index].name + " is kill! " +  _round.party[lootPicker][0] + " gets the [" + _l[loot] +"]";
                addLoot(_round.party[lootPicker][0], _l[loot]);
                var lootTotal = readLootAmount(_round.party[lootPicker][0]);
                buildAnswerMessage += "(" + lootTotal + ")!";
                saveLoot(_loot);
                saveScores(_scores);
                buildAnswerMessage += " LVLs: ";
                buildAnswerMessage  += usersArray.map(i => userInfoLvl(i[0])).slice(0, 15).join(", ");
                _round = new Round(_round.party);
                _runaway = 0;
            } if(runaway === true) {
                _round = new Round(_round.party);
            }
            sendMessage(buildAnswerMessage);
        }, timeout);
    }

    function _poseSeveralQuests(indices, timeout, breaktime, currentIndex) {
        if (currentIndex >= indices.length) {
            return;
        }
        poseSingleQuest(indices[currentIndex], timeout);
        _quest_num++;

        var adj_breaktime = timeout + breaktime;

        if (_quest_num % QUESTS_PER_SCORE_DISPLAY === 0) {
            setTimeout(function() {
                sendMessage(FILTER + " Forward, Adventurers! Kill the foes, get the !loot. Deal damage chatting, and level up with your !party. Or just see the !help.");
            }, timeout + breaktime);
            adj_breaktime = timeout + 2 * breaktime;
        }

        setTimeout(function() {
            var nextIndex;
            if(_round.hpleft <= 0) {
                nextIndex = currentIndex + 1;
            } else {
                nextIndex = currentIndex;
            }
            _poseSeveralQuests(indices, timeout, breaktime, nextIndex);
        }, adj_breaktime);

    }

    function Round(party) {
        this.name = "";
        this.num = 0;
        this.dmg = 0;
        this.hpleft = 0;
        this.lasthit = "";
        this.party = party;
        this.killed = false;
    }

    function poseSeveralQuests(indices, timeout, breaktime) {
        _poseSeveralQuests(indices, timeout, breaktime, 0);
    }

    function increaseScores(users) {
        for (var user in users) {
            if (_scores[user] === undefined) {
                _scores[user] = [0,0, ""];
            }
            _scores[user][0] += users[user];
        }
    }


    function pullNewAnswers() {
        var re = [];
        $('.robin-message--message:not(.addon--judged)').each(function() {
            var user = $('.robin-message--from', $(this).closest('.robin-message')).text();
            re.push([user, $(this).text()]);
            $(this).addClass('addon--judged');
        });
        return re;
    }

    function judgeAnswers(answers) {
        var roundExp = [];
        var _ratio = 0;
        for (var i=0; i<answers.length; ++i) {
            var _user = answers[i][0];
            var _msg = answers[i][1];

            if(filterMessage(_user, _msg) === true) {
                continue;
            }

            if(_msg.includes("!flee")) {
                _runaway += 1;
            }

            var _xp = readXp(_user);
            var _userlevel = computeLevel(_xp === undefined? 1 : _xp ) + 1;
            var _userloot = _scores[_user][1];
            var _lootbonus = 1.125 * (_userloot / (_userloot + 60)) + 1;
            var _guild = readGuild(_user);
            var _guildLevel = 1;
            var _monsterNameBonus = 1;

            if(_round.name !== "" && _msg.includes(_round.name)) {
                _monsterNameBonus = 1.25;
            }

            if(_guild.length > 0) {
                _guildLevel += computeLevel(readGuildXp(_guild));
            }
            if(roundExp[_user] === undefined) {
                roundExp[_user] = 0;
            }

            if(_msg.length > 60) {
                _ratio = 3;
                roundExp[_user] += _ratio * _guildLevel * _monsterNameBonus;
                _round.hpleft -= _userlevel * _lootbonus * _ratio;
                _round.dmg += _userlevel * _lootbonus * _ratio;
            }
            else {
                _ratio = 1;
                roundExp[_user] += _ratio * _guildLevel * _monsterNameBonus;
                _round.hpleft -= _userlevel * _lootbonus * _ratio;
                _round.dmg += _userlevel * _lootbonus * _ratio;
            }

            if(_round.hpleft <= 0 && _round.killed === false) {
                roundExp[_user] += 10;
                _round.lasthit = answers[i][0];
                _round.killed = true;
            }
        }

        return roundExp;
    }

    //function pause(ms) {
    //    _additional_pause += ms;
    //}

    function simpleRpgLoop(q) {
        parseMonsters(q);
        parseLoot(l);
        var r = [ ];
        for (var i=0; i<_q.length; ++i) {
            r.push(i);
        }
        shuffle(_l);
        _round = new Round([]);
        loadScores();
        loadLoot();
        loadBanlist();
        loadGuilds();
        loadAdmins();
        shuffle(r);
        poseSeveralQuests(r, TIME_PER_QUEST, TIME_PER_BREAK);
    }

    function connectLoop() {
        var connectedMessage = $(".robin-message--message:contains('connected!')");
        if (connectedMessage.length > 0) {
            simpleRpgLoop(q);
            console.log("Rpg bot initialized successfully!");
        }
        else {
            console.log("Could not connect; retrying...");
            setTimeout(connectLoop, RETRY_CONNECT);
        }
    }
    connectLoop();
})();
