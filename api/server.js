var express     = require('express');
var bodyParser  = require('body-parser');
var mysql       = require('mysql');
var jwt         = require('jsonwebtoken');
var crypto      = require('crypto');

var config      = require(__dirname + '/config');
var USER_ROLES  = require(__dirname + '/userRoles');


var app = express();
app.use(bodyParser.json()); //read json
app.use(bodyParser.urlencoded({extended: true})); //read data sent in url
app.set('secret', config.secret);


var connection = mysql.createConnection(config.mysqlSettings);
connection.connect (function(error) {
  if (!!error) {
    console.log(error);
  } else {
    console.log('Connected to mysql database');
  }
});


// middleware
app.use('/*', function(req, res, next) {
  console.log(req.method + ' ' + req.originalUrl);
  next();
});


// static routing
app.use(express.static(__dirname + '/../app'));
app.use('/bower_components', express.static(__dirname + '/../bower_components'));


app.use('/auth/register', function(req, res) {
  //var salt = req.body.user.id.toString(); // Replace with random string later
  //var passhashsalt = sha512(req.body.user.password, salt);
  var passhashsalt = saltHashPassword(req.body.user.password); //holds both hash and salt

  var post = {
    userID: req.body.user.id,
    name: req.body.user.name,
    DOB: req.body.user.DOB,
    sex: req.body.user.sex,
    phone: req.body.user.phone,
    passwordHash: passhashsalt.passwordHash,
    passwordSalt: passhashsalt.salt,  //<- Need to store salt with password.  Salt only protects against rainbow table attacks.
  };

  connection.query('SELECT * FROM user WHERE userID = ?', post.userID, function(err, rows, fields) {
    if (err) {
      console.log(err);
      res.status(503).send(err);
      return;
    }

    if (rows.length !== 0) {
      res.json({success: false, message: 'User already Exists'});
      return;
    }

    connection.query('INSERT INTO user SET ?', post, function(err, rows, fields) {
      if (err) {
        console.log(err);
        res.status(503).send(err);
        return;
      }

      if (req.body.user.accountType !== USER_ROLES.pendingTutor && req.body.user.accountType !== USER_ROLES.tutor) {
        var role = USER_ROLES.student;
        var token = jwt.sign({id: post.userID, role: role}, app.get('secret'));
        res.json({success: true, message: 'Registration was Successful', name: post.name, role: role, token: token});
      } else {
        var tutorpost = {
          userID: req.body.user.id,
        };

        connection.query('INSERT INTO tutor SET ?', tutorpost, function(err, rows, fields) {
          if (err) {
            console.log(err);
            res.status(503).send(err);
            return;
          }

          // Uses the Bulk Insert Function to Assign Unit/Language Relationships to Tutor.
          if (req.body.user.id && req.body.user.units) {
            connection.query('INSERT INTO unitTutored (tutor, unit) VALUES ?', [formatUnitData(req.body.user.id,req.body.user.units)], function(err, rows, fields) {
              if (err) {
                console.log(err);
                res.status(503).send(err);
                return;
              }
              if (req.body.user.id && req.body.user.languages) {
                connection.query('INSERT INTO languageTutored (tutor, language) VALUES ?', [formatLanguageData(req.body.user.id,req.body.user.languages)], function(err, rows, fields) {
                  if (err) {
                    console.log(err);
                    res.status(503).send(err);
                    return;
                  }
                  var role = USER_ROLES.pendingTutor;
                  var token = jwt.sign({id: post.userID, role: role}, app.get('secret'));
                  res.json({success: true, message: 'Registration was Successful', name: post.name, role: role, token: token});
                  return;
                });
              }
            });
          }

        });
      }
    });
  });
});

app.use('/auth/login', function(req, res) {

  var details = {
    studentNumber: req.body.user.id,
    password: req.body.user.password,
  };
  //get salt for that user from the db
  connection.query('SELECT passwordSalt FROM user WHERE userID = ?', [details.studentNumber], function(err, rows, fields) {
    if (err) {
      console.log(err);
      res.status(503).send(err);
      return;
    }
    if (!rows || !rows[0]) {
      res.json({success: false, message: 'Username or Password was Incorrect'});
      return;
    }
    var userSalt = rows[0].passwordSalt; //get salt
    var inputHashData = sha512(details.password, userSalt);
    //query within query to check if hashes match: have to do this way afaik unless you use async
    console.log('login with hash ' + inputHashData.passwordHash);
    connection.query('SELECT name FROM user WHERE userID = ? and passwordHash = ?', [details.studentNumber, inputHashData.passwordHash], function(err, rows, fields) {
      if (err) {
        console.log(err);
        res.status(503).send(err);
        return;
      }
      if (!rows || !rows[0]) {
        res.json({success: false, message: 'Username or Password was Incorrect'});
        return;
      }

      var name = rows[0].name;

      connection.query('SELECT userid, verified FROM tutor WHERE userID = ?', [details.studentNumber], function(err, rows, fields) {
        var role;

        if (!rows || !rows[0]) {
          role = USER_ROLES.student;
        } else if (rows[0].verified) {
          role = USER_ROLES.tutor;
        } else {
          role = USER_ROLES.pendingTutor;
        }

        var token = jwt.sign({id: details.studentNumber, role: role}, app.get('secret'));
        res.json({success: true, message: 'Login was Successful', name: name, role: role, token: token});
      });
      return;
    });
  });
});

app.use('/api/getprofile',function(req,res) {
  var user = getUser(req);
  console.log(user);

  if (!user) {
    res.json({success: false, message: 'Please log in to view profile'});
    return;
  }
  if (user.role == USER_ROLES.student) {
    connection.query('SELECT * FROM user WHERE userID = ?', [user.id], function(err, result, fields) {
      if (err) {
        console.log(err);
        res.status(503).send(err);
        return;
      }

      if (!result || !result[0]) {
        res.send('WHO ARE YOU?'); // User deleted, but still has token
        return;
      }
      res.json(result[0]);
    });
  } else if (user.role == USER_ROLES.pendingTutor || USER_ROLES.tutor) {
    connection.query('SELECT * FROM user JOIN tutor ON user.userID = tutor.userID WHERE user.userID = ?', [user.id], function(err, result, fields) {
      if (err) {
        console.log(err);
        res.status(503).send(err);
        return;
      }
      if (!result || !result[0]) {
        res.send('WHO ARE YOU?'); // User deleted, but still has token
        return;
      }

      // Get Unit and Language Data
      var tutorData = result[0];
      var unitData = [];
      var languageData = [];

      connection.query('SELECT unitID, unitName FROM tutor JOIN unitTutored ON tutor.userID = unitTutored.tutor JOIN unit ON unitTutored.unit = unit.unitID WHERE tutor.userID = ?', [user.id], function(err, result, fields) {
        if (err) {
          console.log(err);
          res.status(503).send(err);
          return;
        }

        if (!result || !result[0]) {
          res.status(503).send(err);
          return;
        }

        for (i = 0; i < result.length; i++) {
          unitData[i] = {unitID: result[i].unitID, unitName: result[i].unitName};
        }
        tutorData.units = unitData;

        connection.query('SELECT languageCode, languageName FROM tutor JOIN languageTutored ON tutor.userID = languageTutored.tutor JOIN language ON languageTutored.language = language.languageCode WHERE tutor.userID = ?', [user.id], function(err, result, fields) {
          if (err) {
            console.log(err);
            res.status(503).send(err);
            return;
          }

          if (!result || !result[0]) {
            res.status(503).send(err);
            return;
          }
          for (i = 0; i < result.length; i++) {
            languageData[i] = {languageCode: result[i].languageCode, languageName: result[i].languageName };
          }

          tutorData.languages = languageData;
          res.json(tutorData);
        });
      });
    });
  }
});

app.use('/api/updateprofile',function(req,res) {
    var user = getUser(req);

    if (!user) {
      res.json({success: false, message: 'Please log in to view profile'});
      return;
    }
    var userUpdateData = {
      phone: req.body.user.phone,
    };

    connection.query('UPDATE user SET ? WHERE userID = ?', [userUpdateData,user.id] , function(err, rows, fields) {
        if (err) {
          console.log(err);
          res.status(503).send(err);
          return;
        }
        if (user.role == USER_ROLES.student) {
          res.json({success: true, message: 'Update Success'});
        } else if (user.role == USER_ROLES.pendingTutor || user.role == USER_ROLES.tutor) {
          var tutorUpdateData = {
            bio: req.body.user.bio,
            visible: req.body.user.visible,
          };

          connection.query('UPDATE tutor SET ? WHERE userID = ?', [tutorUpdateData, user.id], function(err, rows, fields) {
              if (err) {
                console.log(err);
                res.status(503).send(err);
                return;
              }
              //Format the MYSQL Commands
              unitDelete = mysql.format('DELETE FROM unitTutored WHERE tutor=?',[user.id]);
              unitInsert = mysql.format('INSERT INTO unitTutored (tutor, unit) VALUES ?', [formatUnitData(user.id,req.body.user.units)]);
              languageDelete = mysql.format('DELETE FROM languageTutored WHERE tutor=?',[user.id]);
              languageInsert = mysql.format('INSERT INTO languageTutored (tutor, language) VALUES ?', [formatLanguageData(user.id,req.body.user.languages)]);

              //'Bulk Update' is achieved (in the simplest way) by deleting and reinserting data in one transaction.
              //A more selective system would definitely be worth looking into
              mysqlTransaction(unitDelete, unitInsert);
              mysqlTransaction(languageDelete, languageInsert);
              res.json({success: true, message: 'Successfully Updated Values'});
            });
        }
      });
  });

app.use('/auth/upgrade', function(req, res) {
  var user = getUser(req);

  if (!user) {
    res.json({success: false, message: 'Please log in to view profile'});
    return;
  }

  var tutorpost = {
    userID: req.body.user.userID,
  };

  connection.query('INSERT INTO tutor SET ?', tutorpost, function(err, rows, fields) {
    if (err) {
      console.log(err);
      res.status(503).send(err);
      return;
    }

    if (req.body.user.userID && req.body.user.units) {
      connection.query('INSERT INTO unitTutored (tutor, unit) VALUES ?', [formatUnitData(req.body.user.userID,req.body.user.units)], function(err, rows, fields) {
        if (err) {
          console.log(err);
          res.status(503).send(err);
          return;
        }
        if (req.body.user.userID && req.body.user.languages) {
          connection.query('INSERT INTO languageTutored (tutor, language) VALUES ?', [formatLanguageData(req.body.user.userID,req.body.user.languages)], function(err, rows, fields) {
            if (err) {
              console.log(err);
              res.status(503).send(err);
              return;
            }
            var role = USER_ROLES.pendingTutor;
            var token = jwt.sign({id: tutorpost.userID, role: role}, app.get('secret'));
            res.json({success: true, message: 'Successfully Upgraded to Tutor Account', role: role, token: token});
            return;
          });
        }
      });
    }
  });
});


// Fetch all Units/Languages available. Useful for Applyform and others
app.use('/api/data/units',function(req,res) {
    connection.query('SELECT * FROM unit', function(err, result, fields) {
      if (err) {
        console.log(err);
        res.status(503).send(err);
        return;
      }
      res.json(result);
    });
  });

app.use('/api/data/languages',function(req,res) {
    connection.query('SELECT * FROM language', function(err, result, fields) {
      if (err) {
        console.log(err);
        res.status(503).send(err);
        return;
      }
      res.json(result);
    });
  });


// Search for tutors
app.use('/api/search', function(req, res) {

  if (!req.body || !req.body.query || !req.body.query.units) {
    res.json({success: false, message: 'Invalid Search Query'});
    return;
  }

  var searchQuery;
  var resultQuery = [];

  var queryString = 'SELECT GROUP_CONCAT(DISTINCT languageName) AS language, GROUP_CONCAT(DISTINCT unitID) AS unitID, tutor.userID, name, phone, bio FROM tutor JOIN languageTutored ON tutor.userID = languageTutored.tutor JOIN language ON languageTutored.language = language.languageCode JOIN unitTutored ON unitTutored.tutor = tutor.userID JOIN unit ON unitTutored.unit = unit.unitID JOIN user ON user.userID = tutor.userID GROUP BY tutor.userID HAVING unitID LIKE ? AND language LIKE ?';
  if (!req.body.query.languages) {
    searchQuery = mysql.format(queryString, ['%'+req.body.query.units.unitID+'%','%']);
  } else {
    searchQuery = mysql.format(queryString, ['%'+req.body.query.units.unitID+'%','%'+req.body.query.languages.languageName+'%']);
  }

  connection.query(searchQuery, function(err, rows, fields) {
    if (err) {
      console.log(err);
      res.status(503).send(err);
      return;
    }
    for (i = 0; i < rows.length; i++) {
      var resultRow = {
        studentNumber: rows[i].userID,
        name: rows[i].name,
        phone: rows[i].phone,
        bio: rows[i].bio,
        units: rows[i].unitID.split(','),
        languages: rows[i].language.split(','),
      };
      resultQuery.push(resultRow);
    }
    res.json(resultQuery);
  });

});


/*  Session pipeline:
 *
 *  request -> appointment -> openSession -> closedSession
 *
 *  A tutor creates a request.
 *  The student either accepts or rejects the request.  If accepted, the request becomes an appointment.
 *  After the session finish time, the appointment becomes an openSession.
 *  A user then closes the openSession or creates an appeal.  Either case the openSession becomes a closedSession.
 *
 *  Whether a session is open or closed depends on the user.  A session will often be open for one user but closed for the other.
 *  Use some sort of status flag to keep track of whether a session is a request, an appointment, open, semiclosed or closed.
 *  Ignore the arrays below.  They will only work for one user only.
 */


var requests = [
  {sessionID: 1003, friend: 'John Smith', contact: '0432123456', date: '07/03/2017', time: '13:00', unit: 'MATH1101'},
  {sessionID: 1004, friend: 'John Smith', contact: '0432123456', date: '07/03/2017', time: '14:00', unit: 'CHEM1101'},
];

var appointments = [
  {sessionID: 1000, friend: 'John Smith', contact: '0432123456', date: '01/03/2017', time: '13:00', unit: 'MATH1101'},
  {sessionID: 1001, friend: 'John Smith', contact: '0432123456', date: '01/03/2017', time: '14:00', unit: 'CHEM1101'},
  {sessionID: 1002, friend: 'John Smith', contact: '0432123456', date: '01/03/2017', time: '15:00', unit: 'PHYS1101'},
];

var openSessions = [
  {sessionID: 998, friend: 'John Smith', contact: '0432123456', date: '20/02/2017', time: '13:00', unit: 'MATH1101'},
  {sessionID: 999, friend: 'John Smith', contact: '0432123456', date: '20/02/2017', time: '14:00', unit: 'CHEM1101'},
];



// Returns a list of session requests
app.use('api/session/get_requests', function(req, res) {
  var user = getUser(req).id;

  res.json(requests);
});

// Return list of upcoming future (accepted) sessions
app.use('api/session/get_appointments', function(req, res) {
  var user = getUser(req).id;

  res.json(appointments);
});

// Return list of open sessions to be signed off on
app.use('api/session/get_open_sessions', function(req, res) {
  var user = getUser(req).id;

  res.json(openSessions);
});



// Creates a new session + request
app.use('api/session/create_request', function(req, res) {
  var user = getUser(req).id; // Also check you're not having a session with yourself (if you know what i mean).

  requests.push(res.body.session);
});


// Accepts a session request
app.use('api/session/accept_request', function(req, res) {
  var user = getUser(req).id;

  var thisSessionID = req.body.sessionID;

  var isThisSession = function(session) {
    return session.sessionID === thisSessionID;
  };

  var notThisSession = function(session) {
    return session.sessionID !== thisSessionID;
  };

  appointments.push(appointments.filter(isThisSession)[0] || {});
  requests = requests.filter(notThisSession);
});


// Reject a session request
app.use('api/session/reject_request', function(req, res) {
  var user = getUser(req).id;

  var thisSessionID = req.body.sessionID;

  var notThisSession = function(session) {
    return session.sessionID !== thisSessionID;
  };

  requests = requests.filter(notThisSession);
});


// Change the time and date of a session
app.use('api/session/reschedule_appointment', function(req, res) {
  // TODO
});


// Cancel an appointment
app.use('api/session/cancel_appointment', function(req, res) {
  var user = getUser(req).id;

  var thisSessionID = req.body.sessionID;

  var notThisSession = function(session) {
    return session.sessionID !== thisSessionID;
  };

  appointments = appointments.filter(notThisSession);
});

// Signs off on an open session
app.use('api/session/close_session', function(req, res) {
  var user = getUser(req).id;

  var thisSessionID = req.body.sessionID;

  var notThisSession = function(session) {
    return session.sessionID !== thisSessionID;
  };

  openSessions = openSessions.filter(notThisSession);
});

// Close on open session by creating an appeal
app.use('api/session/appeal_session', function(req, res) {
  var user = getUser(req).id;

  var thisSessionID = req.body.sessionID;

  var notThisSession = function(session) {
    return session.sessionID !== thisSessionID;
  };

  openSessions = openSessions.filter(notThisSession);
});




// Serve
app.listen(config.server.port, function() {
  console.log('Live at http://localhost:' + config.server.port);
});

function getUser(req) {
  var token = (req.body && req.body.token) || (req.query && req.query.token) || (req.headers && req.headers.authorization);
  //console.log(token);

  if (!token || token.substring(0, 6) !== 'Bearer') {
    return false;
  }

  token = token.split(' ')[1];

  try {
    var decoded = jwt.verify(token, app.get('secret'));
    //console.log(decoded);
    return {id: decoded.id, role: decoded.role};
  } catch (err) {
    //console.log('bad token');
    return false;
  }
}


/**
 * Helper Functions for Bulk Insert/Update
 * @function
 * @param {string} userID - ID used for each.
 * @param {string} obj - JSON of various values.
 */
function formatUnitData(userID, obj) {
  var result = [];
  for (i = 0; i < obj.length; i++) {
    result[i] = [userID,obj[i].unitID];
  }
  return result;
}

function formatLanguageData(userID, obj) {
  var result = [];
  for (i = 0; i < obj.length; i++) {
    result[i] = [userID,obj[i].languageCode];
  }
  return result;
}

/**
 * Simple 2 Query Transaction. queryA -> queryB
 * @function
 * @param {string} queryA - First Query to be executed.
 * @param {string} queryB - Second Query to be executed.
 */
function mysqlTransaction(queryA, queryB) {
  return connection.beginTransaction(function(err) {
    if (err) { return err; }
    connection.query(queryA, function(error, rows, fields) {
      if (error) {
        return connection.rollback(function() {
          console.log(error);
        });
      }

      connection.query(queryB, function(error, results, fields) {
        if (error) {
          return connection.rollback(function() {
            console.log(error);
          });
        }
        connection.commit(function(error) {
          if (error) {
            return connection.rollback(function() {
              console.log(error);
            });
          }
          return {success: true, message: 'Transaction Processed Successfully'};
        });
      });
    });
  });
}

/** [from https://code.ciphertrick.com/2016/01/18/salt-hash-passwords-using-nodejs-crypto/]
 * generates random string of characters i.e salt
 * @function
 * @param {number} length - Length of the random string.
 */
function genRandomString(length) {
  return crypto.randomBytes(Math.ceil(length/2))
    .toString('hex') /** convert to hexadecimal format */
    .slice(0,length);   /** return required number of characters */
}


/**
 * hash password with sha512.
 * @function
 * @param {string} password - List of required fields.
 * @param {string} salt - Data to be validated.
 */
function sha512(password, salt) {
  var hash = crypto.createHmac('sha512', salt); /** Hashing algorithm sha512 */
  hash.update(password);
  var value = hash.digest('hex');
  return {
    salt: salt,
    passwordHash: value,
  };
}

function saltHashPassword(userpassword) {
  var salt = genRandomString(16); /** Gives us salt of length 16 */
  var passwordData = sha512(userpassword, salt);
  return passwordData;
}