var static = require('node-static');

var file = new static.Server('./', {cache: 0});

const PORT = 8080;
console.log(`Listening on ${PORT}`);

require('http').createServer(function (request, response) {
    request.addListener('end', function () {
        file.serve(request, response);
    }).resume();
}).listen(PORT);

