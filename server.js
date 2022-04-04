const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const formidable = require('formidable');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const flash = require('connect-flash');

const Handlebars = require('handlebars');
const { engine } = require('express-handlebars');
const { allowInsecurePrototypeAccess } = require('@handlebars/allow-prototype-access');

const Message = require('./models/message');
const User = require('./models/user');
const Chat = require('./models/chat');
const Smile = require('./models/smile');
const Keys = require('./config/keys');
const { getLastMoment } = require('./helpers/moment');
const { requireLogin, ensureGuest } = require('./helpers/auth');

const app = express();
const port = process.env.PORT || 3000;

// Body parser, reading data from body into req.body
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(session({
    secret: 'mysecret',
    resave: true,
    saveUninitialized: true,
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');

    next();
});

app.use(express.static('public'));

app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
});


require('./passport/facebook');
require('./passport/google');
require('./passport/local');

app.engine('handlebars', engine({
    defaultLayout: 'main',
    helpers: {
        getLastMoment: getLastMoment,
    },
    handlebars: allowInsecurePrototypeAccess(Handlebars),
}));
app.set('view engine', 'handlebars');
app.set('views', './views');

app.get('/', ensureGuest, (req, res) => {
    res.render('home', {
        title: 'Home',
    });
});

app.get('/about', ensureGuest, (req, res) => {
    res.render('about', {
        title: 'About',
    });
});

app.get('/contact', ensureGuest, (req, res) => {
    res.render('contact', {
        title: 'Contact',
    });
});

app.post('/contactUs', (req, res) => {
    const newMessage = {
        fullname: req.body.fullname,
        email: req.body.email,
        message: req.body.message,
        date: new Date(),
    };

    new Message(newMessage).save((err, message) => {
        if (err) {
            throw err;
        } else {
            Message.find({}).then((messages) => {
                if (messages) {
                    res.render('newmessage', {
                        title: 'Sent',
                        messages: messages,
                    });
                } else {
                    res.render('nomessage', {
                        title: 'Not Found',
                    });
                }
            });
        }
    });
});

app.get('/auth/facebook/', passport.authenticate('facebook', {
    scope: ['email'],
}));

app.get('/auth/facebook/callback', passport.authenticate('facebbok', {
    successRedirect: '/profile',
    failureRedirect: '/',
}));

app.get('/auth/google', passport.authenticate('google', {
        scope: ['email', 'profile'],
    },
));

app.get('/auth/google/callback', passport.authenticate('google', {
    successRedirect: '/profile',
    failureRedirect: '/',
}));

app.get('/profile', requireLogin, (req, res) => {
    User.findById({ _id: req.user._id }).then((user) => {
        if (user) {
            user.online = true;
            user.save((err, user) => {
                if (err) {
                    throw err;
                } else {
                    Smile.findOne({ receiver: req.user._id, receiverReceived: false })
                         .then((newSmile) => {
                             Chat.findOne({ $or: [
                                     { receiver: req.user._id, receiverRead: false },
                                     { sender: req.user._id, senderRead: false }
                                 ]})
                                 .then((unread) => {
                                     res.render('profile', {
                                         title: 'Profile',
                                         user: user.toObject(),
                                         newSmile: newSmile,
                                         unread: unread
                                     });
                                 })
                         });
                }
            });
        }
    });
});

app.get('/newAccount', (req, res) => {
    res.render('newAccount', {
        title: 'Signup',
    });
});

app.post('/updateProfile', requireLogin, (req, res) => {
    User.findById({ _id: req.user._id }).then((user) => {
        user.fullname = req.body.fullname;
        user.email = req.body.email;
        user.gender = req.body.gender;
        user.about = req.body.about;

        user.save((err, user) => {
            if (err) {
                throw err;
            } else {
                res.redirect('/profile');
            }
        });
    });
});

app.get('/singles', requireLogin, (req, res) => {
    User.find({})
        .sort({ date: 'desc' })
        .then((singles) => {
            console.log(singles);
            res.render('singles', {
                title: 'Singles',
                singles: singles,
            });
        })
        .catch((err) => {
            console.log(err);
        });
});

app.get('/userProfile/:id', (req, res) => {
    User.findById({ _id: req.params.id })
        .then((user) => {
            Smile.findOne({ receiver: req.params.id })
                 .then((smile) => {
                     res.render('userProfile', {
                         title: 'Profile',
                         oneUser: user,
                         smile: smile,
                     });
                 });
        });
});

app.get('/startChat/:id', requireLogin, (req, res) => {
    Chat.findOne({ sender: req.params.id, receiver: req.user._id })
        .then((chat) => {
            if (chat) {
                chat.reveiverRead = true;
                chat.senderRead = false;
                chat.date = new Date();
                chat.save((err, chat) => {
                    if (err) {
                        throw err;
                    }

                    if (chat) {
                        res.redirect(`/chat/${ chat._id }`);
                    }
                });
            } else {
                Chat.findOne({ sender: req.user._id, receiver: req.params.id })
                    .then((chat) => {
                        if (chat) {
                            chat.senderRead = true;
                            chat.reveiverRead = false;
                            chat.date = new Date();
                            chat.save((err, chat) => {
                                if (err) {
                                    throw err;
                                }

                                if (chat) {
                                    res.redirect(`/chat/${ chat._id }`);
                                }
                            });
                        } else {
                            const newChat = {
                                sender: req.user._id,
                                receiver: req.params.id,
                                senderRead: true,
                                receiverRead: false,
                                date: new Date(),
                            };
                            new Chat(newChat).save((err, chat) => {
                                if (err) {
                                    throw err;
                                }

                                if (chat) {
                                    res.redirect(`/chat/${ chat._id }`);
                                }
                            });
                        }
                    });
            }
        });
});

app.get('/chat/:id', (req, res) => {
    Chat.findById({ _id: req.params.id })
        .populate('sender')
        .populate('receiver')
        .populate('chats.senderName')
        .populate('chats.receiverName')
        .then((chat) => {
            User.findOne({ _id: req.user._id })
                .then((user) => {
                    res.render('chatRoom', {
                        title: 'Chat',
                        user: user,
                        chat: chat,
                    });
                });
        });
});

app.post('/chat/:id', requireLogin, (req, res) => {
    Chat.findOne({ _id: req.params.id, sender: req.user._id })
        .sort({ date: 'desc' })
        .populate('sender')
        .populate('receiver')
        .populate('chats.senderName')
        .populate('chats.receiverName')
        .then((chat) => {
            if (chat) {
                chat.senderRead = true;
                chat.reveiverRead = false;
                chat.date = new Date();

                const newChat = {
                    senderName: req.user._id,
                    senderRead: true,
                    receiverName: chat.receiver._id,
                    receiverRead: false,
                    date: new Date(),
                    senderMessage: req.body.chat,
                };

                chat.chats.push(newChat);
                chat.save((err, chat) => {
                    if (err) {
                        throw err;
                    }

                    if (chat) {
                        Chat.findOne({ _id: chat._id })
                            .sort({ date: 'desc' })
                            .populate('sender')
                            .populate('receiver')
                            .populate('chats.senderName')
                            .populate('chats.receiverName')
                            .then((chat) => {
                                User.findById({ _id: req.user._id })
                                    .then((user) => {
                                        user.wallet = user.wallet - 1;
                                        user.save((err, user) => {
                                            if (err) {
                                                throw err;
                                            }

                                            if (user) {
                                                res.render('chatRoom', {
                                                    title: 'Chat',
                                                    chat: chat,
                                                    user: user,
                                                });
                                            }
                                        });
                                    });
                            });
                    }
                });
            } else {
                Chat.findOne({ _id: req.params.id, receiver: req.user._id })
                    .sort({ date: 'desc' })
                    .populate('sender')
                    .populate('receiver')
                    .populate('chats.senderName')
                    .populate('chats.receiverName')
                    .then((chat) => {
                        chat.senderRead = true;
                        chat.reveiverRead = false;
                        chat.date = new Date();

                        const newChat = {
                            senderName: chat.sender._id,
                            senderRead: false,
                            receiverName: req.user._id,
                            receiverRead: true,
                            date: new Date(),
                            receiverMessage: req.body.chat,
                        };

                        chat.chats.push(newChat);
                        chat.save((err, chat) => {
                            if (err) {
                                throw err;
                            }

                            if (chat) {
                                Chat.findOne({ _id: chat._id })
                                    .sort({ date: 'desc' })
                                    .populate('sender')
                                    .populate('receiver')
                                    .populate('chats.senderName')
                                    .populate('chats.receiverName')
                                    .then((chat) => {
                                        User.findById({ _id: req.user._id })
                                            .then((user) => {
                                                user.wallet = user.wallet - 1;
                                                user.save((err, user) => {
                                                    if (err) {
                                                        throw err;
                                                    }

                                                    if (user) {
                                                        res.render('chatRoom', {
                                                            title: 'Chat',
                                                            chat: chat,
                                                            user: user,
                                                        });
                                                    }
                                                });
                                            });
                                    });
                            }
                        });
                    });
            }
        });
});

app.get('/sendSmile/:id', requireLogin, (req, res) => {
    const newSmile = {
        sender: req.user._id,
        receiver: req.params.id,
        senderSent: true,
    };

    new Smile(newSmile).save((err, smile) => {
        if (err) {
            throw err;
        }

        if (smile) {
            res.redirect(`/userProfile/${ req.params.id }`);
        }
    });
});

app.get('/deleteSmile/:id', requireLogin, (req, res) => {
    Smile.deleteOne({ receiver: req.params.id, sender: req.user._id })
         .then(() => {
             res.redirect(`/userProfile/${ req.params.id }`);
         });
});

app.get('/showSmile/:id', requireLogin, (req, res) => {
    Smile.findOne({ _id: req.params.id })
         .populate('sender')
         .populate('receiver')
         .then((smile) => {
             smile.receiverReceived = true;
             smile.save((err, smile) => {
                 if (err) {
                     throw err;
                 }

                 if (smile) {
                     res.render('smile/showSmile', {
                         title: 'NewSmile',
                         smile: smile,
                     });
                 }
             });
         });
});

app.get('/askToDelete', requireLogin, (req, res) => {
    res.render('askToDelete', {
        title: 'Delete',
    });
});

app.get('/deleteAccount', requireLogin, (req, res) => {
    User.deleteOne({ _id: req.user._id }).then(() => {
        res.render('accountDeleted', {
            title: 'Deleted',
        });
    });
    req.logout();
});

app.post('/signup', (req, res) => {
    let errors = [];

    if (req.body.password !== req.body.password2) {
        errors.push({ text: 'Password doesnt match' });
    }

    if (req.body.password.lenght < 5) {
        errors.push({ text: 'Password must be at least 5 characters' });
    }

    if (errors.length > 0) {
        res.render('newAccount', {
            errors: errors,
            title: 'Error',
            fullname: req.body.username,
            email: req.body.email,
            password: req.body.password,
            password2: req.body.password2,
        });
    } else {
        User.findOne({ email: req.body.email })
            .then((user) => {
                if (user) {
                    let errors = [];
                    errors.push({ text: 'Email already exist' });
                    res.render('newAccount', {
                        title: 'Signup',
                        errors: errors,
                    });
                } else {
                    const salt = bcrypt.genSaltSync(10);
                    const hash = bcrypt.hashSync(req.body.password, salt);

                    const newUser = {
                        fullname: req.body.username,
                        email: req.body.email,
                        password: hash,
                    };

                    new User(newUser).save((err, user) => {
                        if (err) {
                            throw err;
                        }

                        if (user) {
                            let success = [];
                            success.push({
                                text: 'You successfully created account. You can login now',
                            });

                            res.render('home', {
                                success: success,
                            });
                        }
                    });

                }
            });
    }
});

app.post('/login', passport.authenticate('local', {
    successRedirect: '/profile',
    failureRedirect: '/loginErrors',
}));

app.get('/loginErrors', (req, res) => {
    let errors = [];
    errors.push({ text: 'User not found or password incorrect' });
    res.render('home', {
        errors: errors,
    });
});

app.get('/logout', (req, res) => {
    User.findById({ _id: req.user._id }).then((user) => {
        user.online = false;
        user.save((err, user) => {
            if (err) {
                throw err;
            }

            if (user) {
                req.logout();
                res.redirect('/');
            }
        });
    });
});

mongoose
    .connect(Keys.MongoDB, {
        useUnifiedTopology: true,
        useNewUrlParser: true,
    })
    .then(() => console.log('DB connection successful!'))
    .catch(err => console.log(err));

app.listen(port, () => {
    console.log(`Server is running on  port : ${ port }`);
});