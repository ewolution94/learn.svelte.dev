import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

const text_files = new Set([
	'.svelte',
	'.txt',
	'.json',
	'.js',
	'.ts',
	'.css',
	'.svg',
	'.html',
	'.md'
]);

/** @param {string} file */
function json(file) {
	return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

export function get_index() {
	const parts = [];

	let last_section = null;

	for (const part of fs.readdirSync('content/tutorial')) {
		if (!/^\d{2}-/.test(part)) continue;

		const part_meta = json(`content/tutorial/${part}/meta.json`);

		const chapters = [];

		for (const chapter of fs.readdirSync(`content/tutorial/${part}`)) {
			if (!/^\d{2}-/.test(chapter)) continue;

			const group_meta = json(`content/tutorial/${part}/${chapter}/meta.json`);

			const sections = [];

			for (const section of fs.readdirSync(`content/tutorial/${part}/${chapter}`)) {
				const dir = `content/tutorial/${part}/${chapter}/${section}`;
				if (!fs.statSync(dir).isDirectory()) continue;

				const text = fs.readFileSync(`${dir}/text.md`, 'utf-8');
				const { frontmatter, markdown } = extract_frontmatter(text, dir);

				const slug = section.slice(3);

				if (last_section) last_section.next = slug;

				sections.push(
					(last_section = {
						slug: section.slice(3),
						title: frontmatter.title,
						markdown,
						dir,
						/** @type {string | null} */
						prev: last_section ? last_section.slug : null,
						/** @type {string | null} */
						next: null
					})
				);
			}

			chapters.push({
				meta: {
					...part_meta,
					...group_meta
				},
				sections
			});
		}

		parts.push({
			slug: part,
			meta: part_meta,
			chapters
		});
	}

	return parts;
}

/**
 * @param {string} slug
 * @returns {import('$lib/types').Section | undefined}
 */
export function get_section(slug) {
	for (const part of get_index()) {
		for (const chapter of part.chapters) {
			for (const section of chapter.sections) {
				if (section.slug !== slug) continue;

				const a = {
					...walk('content/tutorial/common'),
					...walk(`content/tutorial/${part.slug}/common`),
					...walk(`${section.dir}/app-a`)
				};

				const b = walk(`${section.dir}/app-b`);

				return {
					chapter: chapter.meta,
					title: section.title,
					slug: section.slug,
					prev: section.prev,
					next: section.next,
					html: marked(section.markdown), // TODO syntax highlighting
					a,
					b
				};
			}
		}
	}
}

/**
 * @param {string} markdown
 * @param {string} dir
 */
function extract_frontmatter(markdown, dir) {
	const match = /---\n([^]+?)\n---\n([^]+)/.exec(markdown);
	if (!match) {
		throw new Error(`bad markdown for ${dir}`);
	}

	/** @type {Record<string, string>} */
	const frontmatter = {};

	for (const line of match[1].split('\n')) {
		const index = line.indexOf(':');
		if (index !== -1) {
			frontmatter[line.slice(0, index).trim()] = line.slice(index + 1).trim();
		}
	}

	return { frontmatter, markdown: match[2] };
}

/**
 * Get a list of all files in a directory
 * @param {string} cwd - the directory to walk
 */
export function walk(cwd) {
	/** @type {Record<string, import('$lib/types').FileStub | import('$lib/types').DirectoryStub>} */
	const result = {};

	if (!fs.existsSync(cwd)) return result;

	/**
	 * @param {string} dir
	 * @param {number} depth
	 */
	function walk_dir(dir, depth) {
		const files = fs.readdirSync(path.join(cwd, dir));

		for (const basename of files) {
			if (basename === '.gitkeep') continue;

			const name = dir + basename;
			const resolved = path.join(cwd, name);

			const stats = fs.statSync(resolved);

			if (stats.isDirectory()) {
				result[name] = {
					type: 'directory',
					name,
					basename,
					depth
				};

				walk_dir(name + '/', depth + 1);
			} else {
				const text = text_files.has(path.extname(name));
				const contents = fs.readFileSync(resolved, text ? 'utf-8' : 'base64');

				result[name] = {
					type: 'file',
					name,
					basename,
					text,
					contents,
					depth
				};
			}
		}
	}

	return walk_dir('/', 1), result;
}
