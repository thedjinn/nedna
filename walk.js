var fs = require("fs");
var path = require("path");

exports.walk = (function() {
	var counter = 0;
	var walk = function(dirname, callback, finished) {
		counter += 1;
		fs.readdir(dirname, function(err, relnames) {
			if(err) {
				finished(err);
				return;
			}
			if (relnames.length===0) counter-=1;
			relnames.forEach(function(relname, index, relnames) {
				var name = path.join(dirname, relname);
				counter += 1;
				fs.stat(name, function(err, stat) {
					if(err) {
						finished(err);
						return;
					}
					if(stat.isDirectory()) {
						callback(dirname,relname,name,true);
						exports.walk(name, callback, finished);
					} else {
						callback(dirname,relname,name,false);
					}
					counter -= 1;
					if(index === relnames.length - 1) counter -= 1;
					if(counter === 0) {
						finished(null);
					}
				});
			});
		});
	};
	return walk;
})();
