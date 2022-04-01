const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth2').Strategy;
const User = require('../models/user');
const Keys = require('../config/keys');


passport.use(new GoogleStrategy({
        // consumerKey: Keys.GoogleClientID,
        // consumerSecret: Keys.GoogleClientSecret,
        clientID: Keys.GoogleClientID,
        clientSecret: Keys.GoogleClientSecret,
        callbackURL: 'http://localhost:3000/auth/google/callback',
        // passReqToCallback: true,
    },
    (request, accessToken, refreshToken, profile, done) => {
    console.log(profile);
        User.findOne({ google: profile.id }, (err, user) => {
            if (err) {
                return done(err);
            }

            if (user) {
                return done(err, user);
            } else {
                const newUser = {
                    google: profile.id,
                    fullname: profile.displayName,
                    firstname: profile.name.givenName,
                    lastname: profile.name.familyName,
                    // image: profile.photos[0].value.substring(0, profile.photos[0].value.indexOf('?')),
                    image: profile.photos[0].value,
                    email: profile.emails[0].value,
                }

                new User(newUser).save((err, user) => {
                    if (err) {
                        return done(err);
                    }

                    if (user) {
                        return done(null, user);
                    }
                });
            }
        });

        // User.findOrCreate({ googleId: profile.id }, function (err, user) {
        //     return done(err, user);
        // });
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