const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    facebook: {
        type: String
    },
    google: {
        type: String
    },
    firstname: {
        type: String
    },
    lastname: {
        type: String
    },
    fullname: {
        type: String
    },
    image: {
        type: String,
        default: '/img/user.png'
    },
    email: {
        type: String
    },
    password: {
        type: String
    },
    city: {
        type: String
    },
    country: {
        type: String
    },
    age: {
        type: String
    },
    gender: {
        type: String
    },
    about: {
        type: String
    },
    online: {
        type: Boolean,
        default: false
    },
    wallet: {
        type: Number,
        default: 3
    },
    date: {
        type: Date,
        default: Date.now
    },
    friends: [{
        friend: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        isFriend: {
            type: Boolean,
            default: false
        }
    }]
});

module.exports = mongoose.model('User', userSchema);