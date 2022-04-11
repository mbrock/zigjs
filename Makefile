build:;
	./node_modules/.bin/lezer-generator zig.grammar -o dist/zig.ts
	./node_modules/.bin/esbuild index.ts --bundle --outfile=dist/index.js \
	   --loader:.zig=text --sourcemap

test: test.js dist/zig.js; node test.js
