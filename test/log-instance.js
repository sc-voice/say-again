(typeof describe === 'function') && describe("log-instance", function() {
    const {
        LogInstance,
    } = require('../index');

    it("default ctor", ()=>{
        var logger = new LogInstance();
        should(logger.level).equal('info');
    });
    it("logInstance(obj) decorates object", ()=>{
        var obj = {};
        var logger = new LogInstance();

        // Decorate object with logger and  log() method 
        logger.logInstance(obj);
        should(obj.logger).equal(logger);
        obj.log('info-text');
        var timestamp = logger.lastInfo[0];
        should.deepEqual(logger.lastInfo, [
            timestamp, 'I', 'info-text' ]);

        // new properties are not enumerable
        should.deepEqual(Object.keys(obj), []);
    });
    it("level control logging", ()=>{
        var logger = new LogInstance({
            level: "none",
        });

        // No logging
        logger.debug('text.none');
        logger.info('text.none');
        logger.error('text.none');
        should(logger.lastDebug).equal(undefined);
        should(logger.lastInfo).equal(undefined);
        should(logger.lastError).equal(undefined);

        // error level
        logger.level = "error";
        logger.debug('debug.error');
        logger.info('info.error');
        logger.error('error.error');
        should(logger.lastDebug).equal(undefined);
        should(logger.lastInfo).equal(undefined);
        should(logger.lastError.slice(-1)[0]).equal('error.error');

        // info level
        logger.level = "info";
        logger.debug('debug.info');
        logger.info('info.info');
        logger.error('error.info');
        should(logger.lastDebug).equal(undefined);
        should(logger.lastInfo.slice(-1)[0]).equal('info.info');
        should(logger.lastError.slice(-1)[0]).equal('error.info');

        // debug level
        logger.level = "debug";
        logger.debug('debug.debug');
        logger.info('info.debug');
        logger.error('error.debug');
        should(logger.lastDebug.slice(-1)[0]).equal('debug.debug');
        should(logger.lastInfo.slice(-1)[0]).equal('info.debug');
        should(logger.lastError.slice(-1)[0]).equal('error.debug');

        // any level
        logger.level = "any";
        logger.debug('debug.any');
        logger.info('info.any');
        logger.error('error.any');
        should(logger.lastDebug.slice(-1)[0]).equal('debug.any');
        should(logger.lastInfo.slice(-1)[0]).equal('info.any');
        should(logger.lastError.slice(-1)[0]).equal('error.any');
    });
})
