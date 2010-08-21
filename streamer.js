// The serve_static_file is part of the Antinode project.
//
// Copyright (c) 2010 Noah Sloan <http://noahsloan.com> 
// and Mark Hansen <http://markhansen.co.nz>
// Adapted by Emil Loer <http://koffietijd.net>
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

var fs = require('fs');
var pathlib = require('path');
var url = require('url');
var mime = require('./content-type');
var sys = require('sys');

exports.serve_static_file=function(path, req, resp) {

	function send_headers(httpstatus, headers) {
		headers = headers || {};
		headers["Server"] = "nedna/0.1";
		headers["Date"] = (new Date()).toUTCString();
		resp.writeHead(httpstatus, headers);
	}

	fs.stat(path, function (err, stats) {
		if (err) {
			// ENOENT is normal on 'file not found'
			if (err.errno != process.ENOENT) { 
				// any other error is abnormal - log it
				sys.puts("fs.stat("+path+") failed: "+err);
			}
			return file_not_found();
		}
		if (stats.isDirectory()) {
			var parsedurl = url.parse(req.url);
			if (parsedurl.pathname.match(/\/$/)) {
//				return serve_static_file(pathlib.join(path, "index.html"), req, resp);
				return forbidden();
			} else {
				var redirect_host = req.headers.host ? ('http://' + req.headers['host']) : '';
				var nexturl = parsedurl.pathname + "/" + (parsedurl.search || "");
				return redirect_302_found(redirect_host + nexturl);
			}
		}
		if (!stats.isFile()) {
			return file_not_found();
		} else {
			var if_modified_since = req.headers['if-modified-since'];
			if (if_modified_since) {
				var req_date = new Date(if_modified_since);
				if (stats.mtime <= req_date && req_date <= Date.now()) {
					return not_modified();
				} else {
					stream_file(path, stats);
				}
			} else if (req.method == 'HEAD') {
				send_headers(200, {
					'Content-Length':stats.size, 
					'Content-Type':mime.mime_type(path),
					'Last-Modified': stats.mtime
				});
				resp.end('');
			} else {
				return stream_file(path, stats);
			}
		}
	});

	function stream_file(file, stats) {
		try {
			var readStream = fs.createReadStream(file);
		} catch (err) {
			sys.puts("fs.createReadStream("+file+") error: "+sys.inspect(err,true));
			return file_not_found();
		}

		send_headers(200, {
			'Content-Length':stats.size, 
			'Content-Type':mime.mime_type(file),
			'Last-Modified':stats.mtime
		});
		sys.pump(readStream, resp, function() {
			sys.puts('pumped '+file);
		});

		req.connection.addListener('timeout', function() {
			/* dont destroy it when the fd's already closed */
			if (readStream.readable) {
				sys.puts('timed out. destroying file read stream');
				readStream.destroy();
			}});

			readStream.addListener('fd', function(fd) {
//			sys.puts("opened "+path+" on fd "+fd);
		});

		readStream.addListener('error', function (err) {
			sys.puts('error reading '+file+" - "+sys.inspect(err));
			resp.end('');
		});
		
		resp.addListener('error', function (err) {
			sys.puts('error writing '+file+" - "+sys.inspect(err));
			readStream.destroy();
		});
	}

	function forbidden() {
		// no need to send content length or type
		sys.puts("403 for resource "+path);
		send_headers(403);
		resp.end('');
	}

	function not_modified() {
		// no need to send content length or type
		sys.puts("304 for resource "+path);
		send_headers(304);
		resp.end('');
	}

	function file_not_found() {
		sys.puts("404 opening path: '"+path+"'");
		var body = "404: " + req.url + " not found.\n";
		send_headers(404,{ 
			'Content-Length':body.length,
			'Content-Type':"text/plain"
		});
		if (req.method != 'HEAD') {
			resp.end(body, 'utf-8');
		} else {
			resp.end('');
		}
	}

	function server_error(message) {
		sys.puts(message);
		send_headers(500, {
			'Content-Length':message.length,
			'Content-Type':"text/plain"
		});
		if (req.method !== 'HEAD') {
			resp.end(message,'utf-8');
		}
	}

	function redirect_302_found(location) {
		sys.puts('redirecting with "302 Found" to ' + location);
		send_headers(302, {
			'Location' : location
		});
		resp.end('');
	}
}
