const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');

const User = require('../models/user');

passport.use(new LocalStrategy({
        usernameField: 'email',
        passwordField: 'password',
    },
    (email, password, done) => {
        User.findOne({ email: email })
            .then((user) => {
                if (!user) {
                    return done(null, false);
                }

                bcrypt.compare(password, user.password, (err, isMatch) => {
                    if (err) {
                        return done(err);
                    }

                    if (isMatch) {
                        return done(null, user);
                    } else {
                        return done(null, false);
                    }
                });
            }).catch((err) => {
                console.log(err);
        });
    },
));

passport.serializeUser(function (user, done) {
    return done(null, user.id);
});

passport.deserializeUser((id, done) => {
    User.findById(id, (err, user) => {
        return done(err, user);
    });
});