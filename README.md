# L.js

Opinionated, unobtrusive yet powerful logging library originally made for Peerio apps (http://peerio.com).

Primary goal of this library is to provide debug/logging/troubleshooting tools that can be easily wiped out of production builds completely or partially.

## Features
* Log messages with 4 severity levels: ERROR, INFO, VERBOSE, SILLY
* Utilize string interpolation: L.info('{0} all the things!', 'interpolate')
* Automatically feed all the console.log/warn/error messages into L.js
* Cache logged messages into rolling array of limited size (`L.cache`)
* Benchmark: measure time taken by specific code chunks

## API
L.js adds functions/properties to global scope.

### Settings

* `L.level` - current logging level, one of the `L.LEVELS.*` values. Only messages of this level or lower will be logged.
* `L.cacheLimit` - amount of messages to keep in rolling cache (new messages added on top, FIFO). Set to 0 to disable cache.
Note: the actual `L.cache` array size will change only with the next logging operation.
* `L.benchmarkTimeout` - default number of seconds after which to stop benchmark automatically.
* `L.B.enabled` - enable/disable benchmarks

### L.error(), L.info(), L.verbose(), L.silly() - log message
Logs a message with severity according to function name.

```javascript
// Simple message log
L.info('log message') => 'log message'

// Message log with string interpolation
L.error('width: {0}, height: {1}, width again: {0}', 10, 20) => 'width: 10, height: 20, width again: 10'

// Message log with string interpolation using object argument
L.verbose('{width} {height}', {width:10, height:20}) => '10 20'

// Evaluated message. Useful, when you need to do some calculations to build log message.
// Putting this code out of L call will make it impossible to wipe out of production build.
L.silly(function(){ return 2+2*2; }) => '6'

```

### L.captureConsole(), L.releaseConsole()

Overrides `console.log`, `console.error` and `console.warn` implementations to treat calls as `L.info` and `L.error`

### B - benchmark
`B` provides simple benchmark logs with following syntax:

```javascript
// this call registers benchmark with unique name (first parameter)
// and log message that will be used when logging time passed.
B.start('login', 'Login time:');
// as a 3rd argument, optionally pass a timeout (in seconds) if you want to override default one

// this call stops benchmark with specified id and outputs benchmark message with time passed in milliseconds
B.stop('login');

// sample output:
// 2015-10-11T22:33:16.082Z INF: default timeout success: benchmark | 0.008 s.

// if benchmark times out, it will be stopped and timeout fact logged automatically.
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

## TODO
* better logging code removal (support multi-line functions)
* specs for evaluating logs
* specs for logging code removal