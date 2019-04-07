module.exports = {
  deprecated: function (message) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(message);
    }
  }
};
