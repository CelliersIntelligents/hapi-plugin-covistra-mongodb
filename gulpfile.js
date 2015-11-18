const gulp = require('gulp');
const mocha = require('gulp-mocha');

gulp.task('default', function() {
    return gulp.src(['tests/**/*-spec.js'], {read: false})
        .pipe(mocha({reporter: 'spec'}));
});
