const keys = require('../config/Keys');

module.exports = {
    walletChecker: function (req, res, next) {
        if (req.user.wallet <= 0) {
            res.render('payment', {
                title: 'Payment',
                stripePublishableKey: keys.StripePublishableKey
            })
        } else {
            return next();
        }
    }
}