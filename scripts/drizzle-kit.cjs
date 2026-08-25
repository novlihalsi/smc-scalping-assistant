/* eslint-disable @typescript-eslint/no-require-imports */

const os = require('node:os');

try {
	os.userInfo();
} catch {
	os.userInfo = () => ({
		username: process.env.USERNAME ?? 'unknown',
		uid: -1,
		gid: -1,
		shell: null,
		homedir: process.env.USERPROFILE ?? process.cwd()
	});
}

require('../node_modules/drizzle-kit/bin.cjs');
