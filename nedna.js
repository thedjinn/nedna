'use strict';
var url = require('url');
var sys = require('sys');
var fs = require('fs');
var path = require('path');
var walk = require('./walk');
var http = require('http');
var Inotify = require('inotify').Inotify;
var Mu = require('./lib/Mu');
var streamer = require("./streamer");
var mime = require('./content-type');

Mu.templateRoot="./templates";

var inotify = new Inotify(); //persistent by default, new Inotify(false) //no persistent

var items=[];
var tree=[];
var dirs=[];

var settings=fs.readFileSync("settings.json");
settings=JSON.parse(settings);

var callback = function(event) {
    var mask = event.mask;
    var type = mask & Inotify.IN_ISDIR ? 'Directory ' : 'File ';
    event.name ? type += ' ' + event.name + ' ': ' ';

    if(mask & Inotify.IN_ACCESS) {
        items.push(type + 'was accessed ');
    } else if(mask & Inotify.IN_MODIFY) {
        items.push(type + 'was modified ');
    } else if(mask & Inotify.IN_OPEN) {
        items.push(type + 'was opened ');
    } else if(mask & Inotify.IN_CLOSE_NOWRITE) {
        items.push(type + ' opened for reading was closed ');
    } else if(mask & Inotify.IN_CLOSE_WRITE) {
        items.push(type + ' opened for writing was closed ');
    } else if(mask & Inotify.IN_MOVE) {
        items.push(type + 'was moved ');
    } else if(mask & Inotify.IN_ATTRIB) {
        items.push(type + 'metadata changed ');
    } else if(mask & Inotify.IN_CREATE) {
        items.push(type + 'created');
    } else if(mask & Inotify.IN_DELETE) {
        items.push(type + 'deleted');
    } else if(mask & Inotify.IN_DELETE_SELF) {
        items.push(type + 'watched deleted ');
    } else if(mask & Inotify.IN_MOVE_SELF) {
        items.push(type + 'watched moved');
    } else if(mask & Inotify.IN_IGNORED) {
        items.push(type + 'watch was removed');
    }
//    sys.puts(sys.inspect(event));
	sys.puts("event on "+findwatch(event.watch));
}

function findwatch(id) {
	for (var i=0;i<dirs.length;i++) {
		if (dirs[i].inotify===id) {
			return dirs[i].path;
		}
	}
	return -1;
}

function addwatch(path) {
	var dir = {
		path: path,
		watch_for: Inotify.IN_ALL_EVENTS,
		callback: callback
	};
	return inotify.addWatch(dir);
}

function addfile(path,fullpath,url,list,isdir) {
//	sys.puts("adding "+path);
	if (path.length>1) {
//		sys.puts("dir");
		var found=list.filter(function(e){
			return e.name===path[0];
		});
		if (found.length>0) {
			addfile(path.slice(1),fullpath,url,found[0].children,isdir);
		} else {
			list.push({name:path[0],type:"dir",fullpath:fullpath,url:url,children:[]});
			addfile(path.slice(1),fullpath,url,list[list.length-1].children,isdir);
		}
	} else {
//		sys.puts("file");
		if (isdir) {
			list.push({name:path[0],fullpath:fullpath,url:url,type:"dir",children:[]});
		} else {
			list.push({name:path[0],fullpath:fullpath,url:url,mimecat:mime.mime_type(path[0]),type:"file"});
		}
	}
}

function sorttree(node) {
	node.sort(function(a,b){
		return (b.name<a.name)-(a.name<b.name);
	});
	for (var i=0;i<node.length;++i) {
		if ("children" in node[i]) {
			sorttree(node[i].children);
		}
	}
}

function readtree() {
	dirs=[];
	settings.paths.forEach(function(root) {
		var urlroot="/"+path.basename(root);
		var rootname=path.basename(root);
		dirs.push({path:root,type:"dir",fullpath:root,url:"/"+rootname+"/",inotify:addwatch(root)});
		addfile([rootname],root,"/"+rootname+"/",tree,true);
		walk.walk(root,function(path,filename,absname,isdir){
			if (isdir) {
				console.log("got dir "+path+" -> "+filename+" - "+absname);
				dirs.push({path:absname,inotify:addwatch(root+"/"+absname)});
				var relfile=rootname+absname.slice(root.length);
				addfile(relfile.split("/"),absname,"/"+relfile+"/",tree,true);
			} else {
				// do stuff here
				console.log("got file "+path.slice(root.length)+" -> "+filename+" - "+absname);
				var relfile=rootname+absname.slice(root.length);
				addfile(relfile.split("/"),absname,"/"+relfile,tree,false);
			}
		},function(err){
			if (err) throw err;
//			console.log("done");
			sorttree(tree);
			sys.puts(sys.inspect(dirs));
			sys.puts(sys.inspect(tree));
			sys.puts(dumptree({name:"root",type:"dir",children:tree},0));
//			sys.puts(getnodes("lib/Mu".split("/"),tree).children.map(function(e){return e.name;}));
		});
	});
}

readtree();

function dumptree(n,ind) {
	var out="";
	for (var i=0;i<ind;++i) {
		out+=" ";
	}
	out+=n.name+" "+"("+n.type+") "+n.url+"\n";
	if (n.type=="dir") {
		for (var i=0;i<n.children.length;++i) {
			out+=dumptree(n.children[i],ind+4);
		}
	}
	return out;
}

function getnodes(path,list) {
	var found=list.filter(function(e){
		return e.name===path[0];
	});
	if (found.length==0) {
		return false;
	}
	if (found[0].type=="file") {
		if (path.length>1) {
			return false;
		} else {
			return found[0];
		}
	}
	if (path.length==2) {
		if (path[1]=="") {
			return found[0];
		} else {
			return getnodes(path.slice(1),found[0].children);
		}
	} 
	if (path.length>1) {
		return getnodes(path.slice(1),found[0].children);
	}
	return {type:"redirect",url:found[0].url}; // redirect me
}

/* pages */

Array.prototype.mustachize=function() {
	return this.map(function(e,i,a) {
		if (e.constructor==Object) {
			e.index=i;
			e.first=i===0;
			e.last=i===a.length-1;
			return e;
		} else {
			return {
				value:e,
				index:i,
				first:i===0,
				last:i===a.length-1,
			};
		}
	});
}

function exceptionpage(request,response,code,err) {
	response.writeHead(code, {'Content-Type': 'text/plain'});
	response.end("FAIL "+code+"!!!");
}

function rendertemplate(request,response,filename,ctx) {
	Mu.render(filename,ctx,{},function(err,out){
		if (err) {
			exceptionpage(request,response,500,err);
		} else {
			var buf="";
			out.addListener('data',function(data){
				buf+=data;
			}).addListener('end',function(){
				response.writeHead(200, {'Content-Type': 'text/html'});
				response.end(buf);
			});
		}
	});
}

function indexpage(request, response, url) {
	var dirents;
	if ((url.length==1)&&(url[0].length==0)) {
		dirents={name:"root",type:"dir",children:tree};
	} else {
		dirents=getnodes(url,tree);
	}
	if (dirents.type=="dir") {
		var u="/";
		var ctx={
			path:[{name:"root",url:u}].concat(url.slice(0,-1).map(function(e){
				u+=escape(e)+"/";
				return {name:e,url:u}
			})).mustachize(),
			dirs:dirents.children.filter(function(e){return e.type=="dir"}),
			files:dirents.children.filter(function(e){return e.type=="file"})
		};
		rendertemplate(request,response,"index.html",ctx);
	} else if (dirents.type=="file") {
		streamer.serve_static_file(dirents.fullpath,request,response);
	} else if (dirents.type=="redirect") {
		response.writeHead(302, {'Location': dirents.url});
		response.end('');
	} else {
		response.writeHead(404, {'Content-Type': 'text/html'});
		response.end("404 buddy");
	}
}

/* server */

http.createServer(function (request, response) {
	var uri=url.parse(request.url,true);
	uri.pathname=uri.pathname.replace(/\/(\.\/)+/g,"/");
	uri.pathname=uri.pathname.replace(/\/(\.\.\/)+/g,"/");
	uri.pathname=uri.pathname.replace(/\/\.\.?$/g,"/");
	var pathname=uri.pathname.replace(/%20/g," "); // FIXME: better urldecode
	request.url=uri.pathname+(uri.search||"");
	uri=pathname.slice(1).split("/");//.filter(function(e){return e!==""});

	if (uri[0]=="_") {
		sys.puts("internal");
		if (uri[1]=="assets") {
//	var filename="assets/"+uri.slice(2).join("/");
			var filename="assets/"+pathname.slice(10);
			sys.puts("serving "+filename);
			streamer.serve_static_file(filename,request,response);
		} else {
			sys.puts("function");
			response.writeHead(200, {'Content-Type': 'text/html'});
			response.end("internal function");
		}
	} else if (uri[0]=="favicon.ico") {
		sys.puts("serving favicon.ico");
		streamer.serve_static_file("assets/favicon.ico",request,response);
	} else if (uri[uri.length-1]=="allrecursive.m3u") {
		response.writeHead(200, {'Content-Type': 'text/html'});
		response.end("not implemented yet");
	} else {
		indexpage(request,response,uri);
	}

}).listen(settings.port);
console.log('Http server started');
