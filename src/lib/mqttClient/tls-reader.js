module.exports = function(options) {
   // request certificate from partner
   options.requestCert = true;

   // require certificate authentication
   options.rejectUnauthorized = true;

};
