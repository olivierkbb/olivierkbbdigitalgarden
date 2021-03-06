const slugify = require("@sindresorhus/slugify");
const markdownIt = require("markdown-it");
const fs = require('fs');
const matter = require('gray-matter');
const faviconPlugin = require('eleventy-favicon');
module.exports = function(eleventyConfig) {

    let markdownLib = markdownIt({
            breaks: true,
            html: true
        })
        .use(require("markdown-it-footnote"))
        .use(require('markdown-it-task-checkbox'), {
            disabled: true,
            divWrap: false,
            divClass: 'checkbox',
            idPrefix: 'cbx_',
            ulClass: 'task-list',
            liClass: 'task-list-item'
        })
        .use(namedHeadingsFilter)
        .use(function(md) {
            //https://github.com/DCsunset/markdown-it-mermaid-plugin
            const origFenceRule = md.renderer.rules.fence || function(tokens, idx, options, env, self) {
                return self.renderToken(tokens, idx, options, env, self);
            };
            md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
                const token = tokens[idx];
                if (token.info === 'mermaid') {
                    const code = token.content.trim();
                    return `<pre class="mermaid">${code}</pre>`;
                }
                if (token.info === 'transclusion') {
                    const code = token.content.trim();
                    return `<div class="transclusion">${md.render(code)}</div>`;
                }
                if (token.info.startsWith("ad-")) {
                    const code = token.content.trim();
                    if (code && code.toLowerCase().startsWith("title:")) {
                        const title = code.substring(6, code.indexOf("\n"));
                        const titleDiv = title ? `<div class="admonition-title">${title}</div>` : '';
                        return `<div class="language-${token.info} admonition admonition-example admonition-plugin">${titleDiv}${md.render(code.slice(code.indexOf("\n")))}</div>`;
                    }

                    const title = `<div class="admonition-title">${token.info.charAt(3).toUpperCase()}${token.info.substring(4).toLowerCase()}</div>`;
                    return `<div class="language-${token.info} admonition admonition-example admonition-plugin">${title}${md.render(code)}</div>`;

                }

                // Other languages
                return origFenceRule(tokens, idx, options, env, slf);
            };



            const defaultImageRule = md.renderer.rules.image || function(tokens, idx, options, env, self) {
                return self.renderToken(tokens, idx, options, env, self);
            };
            md.renderer.rules.image = (tokens, idx, options, env, self) => {
                const imageName = tokens[idx].content;
                const [fileName, width] = imageName.split("|");
                if (width) {
                    const widthIndex = tokens[idx].attrIndex('width');
                    const widthAttr = `${width}px`;
                    if (widthIndex < 0) {
                        tokens[idx].attrPush(['width', widthAttr]);
                    } else {
                        tokens[idx].attrs[widthIndex][1] = widthAttr;
                    }
                }

                return defaultImageRule(tokens, idx, options, env, self);
            };


            const defaultLinkRule = md.renderer.rules.link_open || function(tokens, idx, options, env, self) {
                return self.renderToken(tokens, idx, options, env, self);
            };
            md.renderer.rules.link_open = function(tokens, idx, options, env, self) {
                const aIndex = tokens[idx].attrIndex('target');
                const classIndex = tokens[idx].attrIndex('class');

                if (aIndex < 0) {
                    tokens[idx].attrPush(['target', '_blank']);
                } else {
                    tokens[idx].attrs[aIndex][1] = '_blank';
                }

                if (classIndex < 0) {
                    tokens[idx].attrPush(['class', 'external-link']);
                } else {
                    tokens[idx].attrs[classIndex][1] = 'external-link';
                }

                return defaultLinkRule(tokens, idx, options, env, self);
            };
        });

    eleventyConfig.setLibrary("md", markdownLib);

    eleventyConfig.addTransform('link', function(str) {
        return str && str.replace(/\[\[(.*?)\]\]/g, function(match, p1) {
            //Check if it is an embedded excalidraw drawing or mathjax javascript
            if (p1.indexOf("],[") > -1 || p1.indexOf('"$"') > -1) {
                return match;
            }
            const [fileLink, linkTitle] = p1.split("|");

            let fileName = fileLink;
            let header = "";
            let headerLinkPath = "";
            if(fileLink.includes("#")){
                [fileName, header] = fileLink.split("#");
                headerLinkPath = `#${headerToId(header)}`;
            } 

            let permalink = `/notes/${slugify(fileName)}`;
            const title = linkTitle ? linkTitle : fileName;
            

            try {
                const file = fs.readFileSync(`./src/site/notes/${fileName}.md`, 'utf8');
                const frontMatter = matter(file);
                if (frontMatter.data.permalink) {
                    permalink = frontMatter.data.permalink;
                }
            } catch {
                //Ignore if file doesn't exist
            }

            return `<a class="internal-link" href="${permalink}${headerLinkPath}">${title}</a>`;
        });
    })

    eleventyConfig.addTransform('highlight', function(str) {
        return str && str.replace(/\=\=(.*?)\=\=/g, function(match, p1) {
            return `<mark>${p1}</mark>`;
        });
    });

    eleventyConfig.addPassthroughCopy("src/site/img");
    eleventyConfig.addPlugin(faviconPlugin, { destination: 'dist' });

    return {
        dir: {
            input: "src/site",
            output: "dist",
            data: `_data`
        },
        templateFormats: ["njk", "md", "11ty.js", "css"],
        htmlTemplateEngine: "njk",
        markdownTemplateEngine: "njk",
        passthroughFileCopy: true,
    };

};

function headerToId(heading){
    return slugify(heading);
}

//https://github.com/rstacruz/markdown-it-named-headings/blob/master/index.js
function namedHeadingsFilter(md, options){
    md.core.ruler.push('named_headings', namedHeadings.bind(null, md));
}

function namedHeadings (md, state) {

  var ids = {}

  state.tokens.forEach(function (token, i) {
    if (token.type === 'heading_open') {
      var text = md.renderer.render(state.tokens[i + 1].children, md.options)
      var id = headerToId(text);
      var uniqId = uncollide(ids, id)
      ids[uniqId] = true
      setAttr(token, 'id', uniqId)
    }
  })
}

function uncollide (ids, id) {
  if (!ids[id]) return id
  var i = 1
  while (ids[id + '-' + i]) { i++ }
  return id + '-' + i
}

function setAttr (token, attr, value, options) {
  var idx = token.attrIndex(attr)

  if (idx === -1) {
    token.attrPush([ attr, value ])
  } else if (options && options.append) {
    token.attrs[idx][1] =
      token.attrs[idx][1] + ' ' + value
  } else {
    token.attrs[idx][1] = value
  }
}
