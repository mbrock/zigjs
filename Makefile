build:;
	./node_modules/.bin/esbuild index.js --bundle --outfile=dist/index.js \
	   --loader:.zig=text

dist/zig.js: zig.grammar
	./node_modules/.bin/lezer-generator $< -o $@

test: test.js dist/zig.js; node test.js
