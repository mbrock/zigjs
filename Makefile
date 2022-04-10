web: zig.js
	./node_modules/.bin/esbuild web.js --bundle --outfile=dist/index.js --loader:.zig=text

zig.js: zig.grammar
	./node_modules/.bin/lezer-generator $< -o $@

test: zig.js; node test.js
