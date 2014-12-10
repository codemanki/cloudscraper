module.exports = function(grunt) {

  grunt.loadNpmTasks('grunt-mocha-test');

  grunt.initConfig({
    mochaTest: {
      test: {
        options: {
          globals: ['expect', 'sinon'],
          reporter: 'spec',
          quiet: false,
          require: './specs/chai'
        },
        src: ['specs/**/*.js']
      }
    }
  });

  grunt.registerTask('default', ['mochaTest']);
};
