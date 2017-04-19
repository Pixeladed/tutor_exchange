use tutorexchange;

# ------------------
# userExists(userID)
# Returns single row containing the number of users with the specified student number
# Since userID should be unique, returns 1 if user exists, 0 otherwise.

DROP PROCEDURE IF EXISTS userExists;

DELIMITER $
CREATE PROCEDURE `userExists` (ID INT(8))
BEGIN
	SELECT COUNT(*) AS 'exists'
	FROM user
	WHERE userID = ID;
END $
DELIMITER ;

# ------------------
# createUser(userID, firstName, lastName, DOB, sex, phone, passwordHash, passwordSalt)
# Adds a new user to the database (new row in users)
# As seen in 
DROP PROCEDURE IF EXISTS createUser;

DELIMITER $
CREATE PROCEDURE `createUser` (ID INT(8), first VARCHAR(100), last VARCHAR(100), dateOfBirth DATE, userSex CHAR(1), phoneNumber VARCHAR(20), pwHash VARCHAR(255), pwSalt VARCHAR(255))
BEGIN
	INSERT INTO user
	SET userID = ID,
		firstName = first,
		lastName = last,
		DOB = dateOfBirth,
		sex = userSex,
		phone = phoneNumber,
		passwordHash = pwHash,
		passwordSalt = pwSalt;
END $
DELIMITER ;

# ---------
# getUser(userID)
# Returns row of user information for a given student number
DROP PROCEDURE IF EXISTS getUser;

DELIMITER $
CREATE PROCEDURE `getUser` (ID INT(8))
BEGIN
	SELECT *
	FROM user
	WHERE userID = ID;
END $
DELIMITER ;


DROP PROCEDURE IF EXISTS userIsBanned;

DELIMITER $
CREATE PROCEDURE `userIsBanned` (ID INT(8))
BEGIN
	SELECT COUNT(*) FROM bannedUser WHERE userID = ID;
END $
DELIMITER ;