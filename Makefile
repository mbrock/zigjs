build:;
	./node_modules/.bin/lezer-generator zig.grammar -o dist/zig.js
	./node_modules/.bin/esbuild index.js --bundle --outfile=dist/index.js \
	   --loader:.zig=text --sourcemap

test: test.js dist/zig.js; node test.js
