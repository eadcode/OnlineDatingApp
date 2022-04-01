const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const session = require('express-session');

const {engine} = require('express-handlebars');

const Message = require('./models/message');
const User = require('./models/user');
const Keys = require('./config/keys');
const { requireLogin, ensureGuest } = require('./helpers/auth')

const app = express();
const port = process.env.PORT || 3000;

// Body parser, reading data from body into req.body
app.use(express.urlencoded({extended: false, limit: '10kb'}));
app.use(express.json({limit: '10kb'}));
app.use(cookieParser());
app.use(session({
    secret: 'mysecret',
    resave: true,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
})


require('./passport/facebook');

app.engine('handlebars', engine({defaultLayout: 'main'}));
app.set('view engine', 'handlebars');
app.set('views', './views');

app.get('/', ensureGuest, (req, res) => {
    res.render('home', {
        title: 'Home'
    });
});

app.get('/about', ensureGuest, (req, res) => {
    res.render('about', {
        title: 'About'
    });
});

app.get('/contact', (req, res) => {
    res.render('contact', {
        title: 'Contact'
    });
});

app.post('/contactUs', (req, res) => {
    console.log(req.body)
    const newMessage = {
        fullname: req.body.fullname,
        email: req.body.email,
        message: req.body.message,
        date: new Date()
    }

    new Message(newMessage).save((err, message) => {
        if (err) {
            throw err;
        } else {
            Message.find({}).then((messages) => {
                if (messages) {
                    res.render('newmessage', {
                        title: 'Sent',
                        messages: messages
                    });
                } else {
                    res.render('nomessage', {
                        title: 'Not Found'
                    });
                }
            });
        }
    });
});

app.get('/auth/facebook/', passport.authenticate('facebook', {
    scope: ['email']
}));

app.get('/auth/facebook/callback', passport.authenticate('facebbok', {
    successRedirect: '/profile',
    failureRedirect: '/'
}));

app.get('/profile', requireLogin, (req, res) => {
    User.findById({_id: req.user._id}).then((user) => {
        if (user) {
            user.online = true;
            user.save((err, user) => {
                if (err) {
                    throw err;
                } else {
                    res.render('profile', {
                        title: 'Profile',
                        user: user,
                    });
                }
            });
        }
    });
});

app.get('/logout', (req, res) => {
    User.findById({_id: req.user._id}).then((user) => {
        user.online = false
        user.save((err, user) => {
            if (err) {
                throw err;
            }

            if (user) {
                req.logout();
                res.redirect('/');
            }
        })
    });
})

mongoose
    .connect(Keys.MongoDB, {
        useUnifiedTopology: true,
        useNewUrlParser: true,
    })
    .then(() => console.log('DB connection successful!'))
    .catch(err => console.log(err));

app.listen(port, () => {
    console.log(`Server is running on  port : ${port}`)
});