"use strict"

const gulp = require('gulp'),
    babelify = require('babelify'),
    browserify = require('browserify'),
    source = require('vinyl-source-stream'),
    buffer = require('vinyl-buffer'),
    gutil = require('gulp-util');

gulp.task('default', () => {
    return browserify('src/L.js', { debug: true, standalone: 'L' })
        .transform(babelify, { presets: ['es2015', 'stage-0'] })
        .bundle()
        .pipe(source('L.js'))
        .pipe(buffer())
        .pipe(gulp.dest('build'))
        .on('end', () => gutil.log(gutil.colors.green('==> Successful Bundle!')));
});
