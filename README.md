# robin-rpg

Based on [https://github.com/npinsker/robin_triviabot/](https://github.com/npinsker/robin_triviabot/)
 * grind xp and levels!
 * kill monsters!
 * find loot!
 * ... profit? 

To run it, use robin grow(not parrot) and don't filter the chat.

##List of available commands:

###General commands:
 * **!help** - Explain the game and link to github.
 * **!commands** - List some of the commands.
 * **!party** - Show the people who attacked last round, with ranks.
 * **!heroes** - Show the highest ranked users.
 * **!flee** - Vote to flee the monster.

###Guild System commands:

 * **!create** _guild_ - Creates and join a guild named "guild". You will exit your current guild. Costs 5 loot by default.
 * **!join** _guild_ - Join a guild. Guild tags show up with your name in lists, and will give bonus XP according to their level.
 * **!deposit** _x_ - Deposit _x_ of your loot in your current guild vault, increasing the guild level.
 * **!depall** - Deposit all your loot in your current guild vault, increasing the guild level.
 * **!guilds** - Show a rank with the biggest guilds.

###Admin commands:
 * **!ban** _user_ - Bans a user from using the bot
 * **!unban** _user_ - Unbans a user from using the bot
 * **!banlist** - Shows a list of banned users.
 * **!promote** _user_ - Promotes a user to admin status
 * **!demote** _user_ - Demotes a user from admin to regular status
 * **!admins** - Shows a list of all admin users.
 * **!deleteuser** _user_ - Deletes the data for a player

Includes: some anti-spam, some channel filters. 