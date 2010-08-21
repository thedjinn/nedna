<!DOCTYPE html>
<html>
	<head>
		<title>nedna - node.js streaming mp3 server</title>
		<link rel="shortcut icon" href="/_/assets/favicon.png"/>
		<link rel="stylesheet" href="/_/assets/css/style.css" media="all" />
	</head>
	<body>
		<header class="c12">
			<section class="g12">
				<h1>nedna - node.js streaming mp3 server</h1>
				<p>{{# path }}{{# last }}{{ name }}{{/ last }}{{^ last }}<a href="{{ url }}">{{ name }}</a> &raquo; {{/ last }}{{/ path }}</p>
				<p>{{ levelup }}</p>
			</section>
		</header>
		<section class="c12 clearfix">
			<ul class="g10">
			{{# dirs }}
				<li><img src="/_/assets/icons/folder.png"/><a href="{{ url }}allrecursive.m3u">allrecursive</a> - <a href="{{ url }}">{{ name }}</a> - {{ type }}</li>
			{{/ dirs }}
			{{# files }}
				<li><img src="/_/assets/icons/music.png"/><a href="{{ url }}">{{ name }}</a> - {{ mimecat }}</li>
			{{/ files }}
			</ul>
			<aside class="g2">
				sidebar
			</aside>
		</section>
	</body>
</html>
