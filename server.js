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
const Post = require('./models/post');
const Keys = require('./config/keys');

const stripe = require('stripe')(Keys.StripeSecretKey);

const { walletChecker } = require('./helpers/wallet');
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
        title: 'Welcome',
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
    User.findById({ _id: req.user._id })
        .populate('friends.friend')
        .then((user) => {
        if (user) {
            user.online = true;
            user.save((err, user) => {
                if (err) {
                    throw err;
                } else {
                    Smile.findOne({ receiver: req.user._id, receiverReceived: false })
                         .then((newSmile) => {
                             Chat.findOne({
                                 $or: [
                                     { receiver: req.user._id, receiverRead: false },
                                     { sender: req.user._id, senderRead: false },
                                 ],
                             })
                                 .then((unread) => {
                                     Post.find({ postUser: req.user._id })
                                         .populate('postUser')
                                         .sort({ date: 'desc' })
                                         .then((posts) => {
                                             if (posts) {
                                                 res.render('profile', {
                                                     title: 'Profile',
                                                     user: user.toObject(),
                                                     newSmile: newSmile,
                                                     unread: unread,
                                                     posts: posts,
                                                 });
                                             } else {
                                                 res.render('profile', {
                                                     title: 'Profile',
                                                     user: user.toObject(),
                                                     newSmile: newSmile,
                                                     unread: unread,
                                                 });
                                             }
                                         });

                                 });
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

app.get('/userProfile/:id', requireLogin, (req, res) => {
    User.findById({ _id: req.params.id })
        .populate('friends.friend')
        .then((user) => {
            Smile.findOne({ receiver: req.params.id })
                 .then((smile) => {
                     Post.find({ status: 'public', postUser: user._id })
                         .populate('postUser')
                         .populate('comments.commentUser')
                         .populate('likes.likeUser')
                         .then((publicPosts) => {
                             res.render('userProfile', {
                                 title: 'Profile',
                                 oneUser: user,
                                 smile: smile,
                                 publicPosts: publicPosts,
                             });
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

app.post('/chat/:id', requireLogin, walletChecker, (req, res) => {
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

app.get('/chats', requireLogin, (req, res) => {
    Chat.find({ receiver: req.user._id })
        .populate('sender')
        .populate('receiver')
        .populate('chats.senderName')
        .populate('chats.receiverName')
        .sort({ date: 'desc' })
        .then((received) => {
            Chat.find({ sender: req.user._id })
                .populate('sender')
                .populate('receiver')
                .populate('chats.senderName')
                .populate('chats.receiverName')
                .sort({ date: 'desc' })
                .then((sent) => {
                    res.render('chat/chats', {
                        title: 'Chat History',
                        received: received,
                        sent: sent,
                    });
                });
        });
});

app.get('/deleteChat/:id', requireLogin, (req, res) => {
    Chat.deleteOne({ _id: req.params.id })
        .then(() => {
            res.redirect('/chats');
        });
});

app.post('/charge10dollars', requireLogin, (req, res) => {
    const amount = 1000;
    stripe.customers.create({
        email: req.body.stripeEmail,
        source: req.body.stripeToken,
    }).then((customer) => {
        stripe.charges.create({
            amount: amount,
            description: '$10 for 20 messages',
            currency: 'usd',
            customer: customer.id,
            receipt_email: customer.email,
        }).then((charge) => {
            if (charge) {
                User.findById({ _id: req.user._id })
                    .then((user) => {
                        user.wallet += 20;
                        user.save().then(() => {
                            res.render('success', {
                                title: 'Success',
                                charge: charge,
                            });
                        });
                    });
            }
        }).catch((err) => {
            console.log(err);
        });
    }).catch((err) => {
        console.log(err);
    });
});

app.post('/charge20dollars', requireLogin, (req, res) => {
    const amount = 2000;
    stripe.customers.create({
        email: req.body.stripeEmail,
        source: req.body.stripeToken,
    }).then((customer) => {
        stripe.charges.create({
            amount: amount,
            description: '$20 for 50 messages',
            currency: 'usd',
            customer: customer.id,
            receipt_email: customer.email,
        }).then((charge) => {
            if (charge) {
                User.findById({ _id: req.user._id })
                    .then((user) => {
                        user.wallet += 50;
                        user.save().then(() => {
                            res.render('success', {
                                title: 'Success',
                                charge: charge,
                            });
                        });
                    });
            }
        }).catch((err) => {
            console.log(err);
        });
    }).catch((err) => {
        console.log(err);
    });
});

app.post('/charge30dollars', requireLogin, (req, res) => {
    const amount = 3000;
    stripe.customers.create({
        email: req.body.stripeEmail,
        source: req.body.stripeToken,
    }).then((customer) => {
        stripe.charges.create({
            amount: amount,
            description: '$30 for 100 messages',
            currency: 'usd',
            customer: customer.id,
            receipt_email: customer.email,
        }).then((charge) => {
            if (charge) {
                User.findById({ _id: req.user._id })
                    .then((user) => {
                        user.wallet += 100;
                        user.save().then(() => {
                            res.render('success', {
                                title: 'Success',
                                charge: charge,
                            });
                        });
                    });
            }
        }).catch((err) => {
            console.log(err);
        });
    }).catch((err) => {
        console.log(err);
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

app.get('/displayPostForm', requireLogin, (req, res) => {
    res.render('post/displayPostForm', {
        title: 'Post',
    });
});

app.post('/createPost', requireLogin, (req, res) => {
    let allowComments = Boolean;
    if (req.body.allowComments) {
        allowComments = true;
    } else {
        allowComments = false;
    }

    const newPost = {
        title: req.body.title,
        body: req.body.body,
        status: req.body.status,
        // image: `url/${req.body.image}`
        postUser: req.user._id,
        allowComments: allowComments,
        date: new Date(),
    };

    if (req.body.status === 'public') {
        newPost.icon = 'fas fa-globe';
    }

    if (req.body.status === 'private') {
        newPost.icon = 'fas fa-key';
    }

    if (req.body.status === 'private') {
        newPost.icon = 'fas fa-user-friends';
    }

    new Post(newPost)
        .save()
        .then(() => {
            if (req.body.status === 'public') {
                res.redirect('/posts');
            } else {
                res.redirect('/profile');
            }
        });
});

app.get('/posts', requireLogin, (req, res) => {
    Post.find({ status: 'public' })
        .populate('postUser')
        .sort({ date: 'desc' })
        .then((posts) => {
            res.render('post/posts', {
                title: 'Posts',
                posts: posts,
            });
        });
});

app.get('/deletePost/:id', requireLogin, (req, res) => {
    Post.deleteOne({ _id: req.params.id })
        .then(() => {
            res.redirect('/profile');
        });
});

app.get('/editPost/:id', requireLogin, (req, res) => {
    Post.findById({ _id: req.params.id })
        .then((post) => {
            res.render('post/editPost', {
                title: 'Editing Post',
                post: post,
            });
        });
});

app.post('/editPost/:id', requireLogin, (req, res) => {
    Post.findByIdAndUpdate({ _id: req.params.id })
        .then((post) => {
            let allowComments = Boolean;
            if (req.body.allowComments) {
                allowComments = true;
            } else {
                allowComments = false;
            }

            post.title = req.body.title;
            post.body = req.body.body;
            post.status = req.body.status;
            post.allowComments = allowComments;
            // post.image = req.body.image;
            post.date = new Date();

            if (req.body.status === 'public') {
                newPost.icon = 'fas fa-globe';
            }

            if (req.body.status === 'private') {
                newPost.icon = 'fas fa-key';
            }

            if (req.body.status === 'private') {
                newPost.icon = 'fas fa-user-friends';
            }

            post.save()
                .then(() => {
                    res.redirect('/profile');
                });
        });
});

app.get('/likePost/:id', requireLogin, (req, res) => {
    Post.findById({ _id: req.params.id })
        .then((post) => {
            const newLike = {
                likeUser: req.user._id,
                date: new Date(),
            };

            post.likes.push(newLike);
            post.save((err, post) => {
                if (err) {
                    throw err;
                }

                if (post) {
                    res.redirect(`/fullPost/${ post._id }`);
                }
            });
        });
});

app.get('/fullPost/:id', requireLogin, (req, res) => {
    Post.findById({ _id: req.params.id })
        .populate('postUser')
        .populate('likes.likeUser')
        .populate('comments.commentUser')
        .sort({ date: 'desc' })
        .then((post) => {
            res.render('post/fullpost', {
                title: 'Full Post',
                post: post,
            });
        });
});

app.post('/leaveComment/:id', requireLogin, (req, res) => {
    Post.findById({ _id: req.params.id })
        .then((post) => {
            const newComment = {
                commentUser: req.user._id,
                commentBody: req.body.commentBody,
                date: new Date(),
            };

            post.comments.push(newComment);
            post.save((err, post) => {
                if (err) {
                    throw err;
                }

                if (post) {
                    res.redirect(`/fullpost/${ post._id }`);
                }
            });
        });
});

app.get('/sendFriendRequest/:id', requireLogin, (req, res) => {
    User.findOne({ _id: req.params.id })
        .then((user) => {
            const newFriendRequest = {
                friend: req.user._id,
            };

            user.friends.push(newFriendRequest);
            user.save((err, user) => {
                if (err) {
                    throw err;
                }

                if (user) {
                    res.render('friends/askFriendRequest', {
                        title: 'Friend Request',
                        newFriend: user,
                    });
                }
            });
        });
});

app.get('/showFriendRequest/:id', requireLogin, (req, res) => {
    User.findOne({ _id: req.params.id })
        .then((userRequest) => {
            res.render('friends/showFriendRequest', {
                title: 'User Request',
                userRequest: userRequest,
            });
        });
});

app.get('/acceptFriend/:id', requireLogin, (req, res) => {
    User.findById({ _id: req.user._id })
        .populate('friends.friend')
        .then((user) => {
            user.friends.filter((friend) => {
                if (friend._id = req.params.id) {
                    friend.isFriend = true;
                    user.save()
                        .then(() => {
                            User.findById({ _id: req.params.id })
                                .then((requestSender) => {
                                    const newFriend = {
                                        friend: req.user._id,
                                        isFriend: true,
                                    };

                                    requestSender.friends.push(newFriend);
                                    requestSender
                                        .save()
                                        .then(() => {
                                            User.findById({ _id: req.user._id })
                                                .populate('friends.friend')
                                                .sort({ date: 'desc' })
                                                .then((user) => {
                                                    res.render('friends/friendAccepted', {
                                                        title: 'Friends',
                                                        userInfo: user,
                                                    });
                                                });
                                        });
                                });
                        });
                } else {
                    res.render('friends/404', {
                        title: 'Not found',
                    });
                }
            });
        }).catch(err => {
        console.log(err);
    });
});

app.get('/rejectFriend/:id', requireLogin, (req, res) => {
    User.findById({ _id: req.user._id })
        .populate('friends.friend')
        .then((user) => {
            user.friends.filter((friend) => {
                if (friend._id = req.params.id) {
                    user.friends.pop(friend);
                    user.save()
                        .then(() => {
                            User.findOne({ _id: req.params.id })
                                .then((friend) => {
                                    res.render('friends/friendRejected', {
                                        title: 'Friends',
                                        friend: friend,
                                    });
                                });
                        });
                } else {
                    res.render('friends/404', {
                        title: 'Not found',
                    });
                }
            });
        });
});

app.get('/friends', requireLogin, (req, res) => {
    User.findById({ _id: req.user._id })
        .populate('friends.friend')
        .then((user) => {
            res.render('friends/allFriends', {
                title: 'Friends',
                userFriends: user,
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

app.get('/retrievePassword', (req, res) => {
    res.render('retrievePassword', {
        title: 'Retrieve Password',
    });
});

app.post('/retrievePassword', (req, res) => {
    let email = req.body.email.trim();
    let pwd1 = req.body.password.trim();
    let pwd2 = req.body.password2.trim();

    if (pwd1 !== pwd2) {
        res.render('passwordNotMatch', {
            title: 'Not match',
        });
    }

    User.findOne({ email: email })
        .then((user) => {
            const salt = bcrypt.genSaltSync(10);
            const hash = bcrypt.hashSync(pwd1, salt);

            user.password = hash;

            user.save((err, user) => {
                if (err) {
                    throw err;
                }

                if (user) {
                    res.render('passwordUpdated', {
                        title: 'Updated',
                    });
                }
            });
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