const Debugger = require('./debugger.js');

const debug = new Debugger(9000, 9001);

debug.RegisterFor('misc:ping', debug.OnPing);
