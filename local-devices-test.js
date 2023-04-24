const find = require('local-devices');

// Find all local network devices.
find().then(devices => {
    console.log(devices);
})