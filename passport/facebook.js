const passport = require('passport');
const Strategy = require('passport-facebook');
const User = require('../models/user');
const Keys = require('../config/keys');

module.exports = function () {

    // Configure the Facebook strategy for use by Passport.
    //
    // OAuth 2.0-based strategies require a `verify` function which receives the
    // credential (`accessToken`) for accessing the Facebook API on the user's
    // behalf, along with the user's profile.  The function must invoke `cb`
    // with a user object, which will be set at `req.user` in route handlers after
    // authentication.
    passport.use(new Strategy({
        clientID: Keys.FacebookAppID,
        clientSecret: Keys.FacebookAppSecret,
        // callbackURL: '/oauth2/redirect/www.facebook.com',
        callbackURL: 'http://localhost:3000/auth/facebook/callback',
        profileFields: ['email', 'name', 'displayName', 'photos'],
        state: true,
    }, (accessToken, refreshToken, profile, done) => {
        console.log(profile);
        User.findOne({ facebook: profile.id}, (err, user) => {
            if (err) {
                return done(err);
            }

            if (user) {
                return done(null, user);
            } else {
                const newUser = {
                    facebook: profile.id,
                    fullname: profile.displayName,
                    firstname: profile.name.givenName,
                    lastname: profile.name.familyName,
                    image: `https://graph.facebook.com/${profile.id}/picture?type=large`,
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
    }));

    // Configure Passport authenticated session persistence.
    //
    // In order to restore authentication state across HTTP requests, Passport needs
    // to serialize users into and deserialize users out of the session.  In a
    // production-quality application, this would typically be as simple as
    // supplying the user ID when serializing, and querying the user record by ID
    // from the database when deserializing.  However, due to the fact that this
    // example does not have a database, the complete Facebook profile is serialized
    // and deserialized.
    passport.serializeUser(function (user, done) {
        done(null, user.id);
    });

    passport.deserializeUser(function (id, done) {
        User.findById(id, (err, user) => {
            done(err, user);
        });
    });
};