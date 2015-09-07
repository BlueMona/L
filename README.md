# L.js
Unobtrusive yet powerful debug logging library originally made for Peerio apps.
Primary goal of this library is to provide debug/logging tools that can be easily and completely wiped out of production builds.

Currently supports only `console.log`.

## API
L.js adds functions/properties to global scope.

### L() - log
`L` function adds a regular log line

```javascript
// Simple message log
L('log message') => 'log message'

// Message log with string interpolation
L('width: {0}, height: {1}, width again: {0}', 10, 20) => 'width: 10, height: 20, width again: 10'

// Message log with string interpolation using object argument
L('{width} {height}', {width:10, height:20}) => '10 20'

// Evaluated message. Useful, when you need to do some calculations to build log message.
// Putting this code out of L call will make it impossible to wipe out of production build.
L(function(){ return 2+2*2; }) => '6'

```

### T() - trace
`T` function is essentially the same as `L` function, except one small, but important detail:

You can dynamically enable and disable `T` output with:
```javascript
T.enabled = true; // default
```

Use `T` for high frequency or heavy resource consuming logs, so you can disable them when not needed.

### B - benchmark
`B` provides simple benchmark logs with following syntax:

```javascript
// this call registers benchmark with unique id (first parameter)
// and log message that will be used when logging time passed.
B.start('login', 'Login time:');

// this call stops benchmark with specified id and outputs benchmark message with time passed in milliseconds
B.stop('login');
```

Ongoing benchmarks do not consume any CPU resource.


## Example gulp task for wiping logging code out

To remove logging code from production builds do the following:
1. Do not forget to remove L.js library itself from the build.
2. Install `npm install --save-dev gulp-replace` or similar regex replacing library
3. Use regexp filters: `/^\s*[LT]\s*\(.*$/gm` `/^\s*B\s*\.\s*(start|stop)\s*\(.*$/gm` `/^\s*T\s*\..*$/gm`
WARNING: ONLY SINGLE-LINE CALLS CURRENTLY SUPPORTED!

`gulp-replace` task example
```javascript
gulp.task('strip-logs', function(){
  gulp.src(['file.js'])
    .pipe(replace(/^\s*[LT]\s*\(.*$/gm, ''))
    .pipe(replace(/^\s*B\s*\.\s*(start|stop)\s*\(.*$/gm, ''))
    .pipe(replace(/^\s*T\s*\..*$/gm, ''))
    .pipe(gulp.dest('build/file.js'));
});
```