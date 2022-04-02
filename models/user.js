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
    online: {
        type: Boolean,
        default: false
    },
    wallet: {
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model('User', userSchema);