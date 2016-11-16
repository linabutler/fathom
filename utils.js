const {forEach, map} = require('wu');


function identity(x) {
    return x;
}


// From an iterable return the best item, according to an arbitrary comparator
// function. In case of a tie, the first item wins.
function best(iterable, by, isBetter) {
    let bestSoFar, bestKeySoFar;
    let isFirst = true;
    forEach(
        function (item) {
            const key = by(item);
            if (isBetter(key, bestKeySoFar) || isFirst) {
                bestSoFar = item;
                bestKeySoFar = key;
                isFirst = false;
            }
        },
        iterable);
    if (isFirst) {
        throw new Error('Tried to call best() on empty iterable');
    }
    return bestSoFar;
}


// Return the maximum item from an iterable, as defined by >.
//
// Works with any type that works with >. If multiple items are equally great,
// return the first.
//
// by: a function that, given an item of the iterable, returns a value to
//     compare
function max(iterable, by = identity) {
    return best(iterable, by, (a, b) => a > b);
}


// Return an Array of maximum items from an iterable, as defined by > and ===.
function maxes(iterable, by = identity) {
    let bests, bestKeySoFar;
    let isFirst = true;
    forEach(
        function (item) {
            const key = by(item);
            if (key > bestKeySoFar || isFirst) {
                bests = [item];
                bestKeySoFar = key;
                isFirst = false;
            } else if (key === bestKeySoFar) {
                bests.push(item);
            }
        },
        iterable);
    if (isFirst) {
        throw new Error('Tried to call maxes() on empty iterable');
    }
    return bests;
}


function min(iterable, by = identity) {
    return best(iterable, by, (a, b) => a < b);
}


// Return the sum of an iterable, as defined by the + operator.
function sum(iterable) {
    let total;
    let isFirst = true;
    forEach(
        function assignOrAdd(addend) {
            if (isFirst) {
                total = addend;
                isFirst = false;
            } else {
                total += addend;
            }
        },
        iterable);
    return total;
}


function length(iterable) {
    let num = 0;
    // eslint-disable-next-line no-unused-vars
    for (let item of iterable) {
        num++;
    }
    return num;
}


// Iterate, depth first, over a DOM node. Return the original node first.
// shouldTraverse - a function on a node saying whether we should include it
//     and its children
function *walk(element, shouldTraverse) {
    yield element;
    for (let child of element.childNodes) {
        if (shouldTraverse(child)) {
            for (let w of walk(child, shouldTraverse)) {
                yield w;
            }
        }
    }
}


const blockTags = new Set();
forEach(blockTags.add.bind(blockTags),
        ['ADDRESS', 'BLOCKQUOTE', 'BODY', 'CENTER', 'DIR', 'DIV', 'DL',
         'FIELDSET', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR',
         'ISINDEX', 'MENU', 'NOFRAMES', 'NOSCRIPT', 'OL', 'P', 'PRE',
         'TABLE', 'UL', 'DD', 'DT', 'FRAMESET', 'LI', 'TBODY', 'TD',
         'TFOOT', 'TH', 'THEAD', 'TR', 'HTML']);
// Return whether a DOM element is a block element by default (rather
// than by styling).
function isBlock(element) {
    return blockTags.has(element.tagName);
}


// Yield strings of text nodes within a normalized DOM node and its
// children, without venturing into any contained block elements.
//
// shouldTraverse: A function that specifies additional elements to
//     exclude by returning false
function *inlineTexts(element, shouldTraverse = element => true) {
    // TODO: Could we just use querySelectorAll() with a really long
    // selector rather than walk(), for speed?
    for (let child of walk(element,
                             element => !(isBlock(element) ||
                                          element.tagName === 'SCRIPT' &&
                                          element.tagName === 'STYLE')
                                        && shouldTraverse(element))) {
        if (child.nodeType === child.TEXT_NODE) {
            // wholeText() is not implemented by jsdom, so we use
            // textContent(). The result should be the same, since
            // we're calling it on only text nodes, but it may be
            // slower. On the positive side, it means we don't need to
            // normalize the DOM tree first.
            yield child.textContent;
        }
    }
}


function inlineTextLength(element, shouldTraverse = element => true) {
    return sum(map(text => collapseWhitespace(text).length,
                   inlineTexts(element, shouldTraverse)));
}


function collapseWhitespace(str) {
    return str.replace(/\s{2,}/g, ' ');
}


// Return the ratio of the inline text length of the links in an
// element to the inline text length of the entire element.
function linkDensity(node) {
    const length = node.flavors.get('paragraphish').inlineLength;
    const lengthWithoutLinks = inlineTextLength(node.element,
                                                element => element.tagName !== 'A');
    return (length - lengthWithoutLinks) / length;
}


// Return the next sibling node of `element`, skipping over text nodes that
// consist wholly of whitespace.
function isWhitespace(element) {
    return (element.nodeType === element.TEXT_NODE &&
            element.textContent.trim().length === 0);
}


// Get a key of a map, first setting it to a default value if it's missing.
function setDefault(map, key, defaultMaker) {
    if (map.has(key)) {
        return map.get(key);
    }
    const defaultValue = defaultMaker();
    map.set(key, defaultValue);
    return defaultValue;
}


// Get a key of a map or, if it's missing, a default value.
function getDefault(map, key, defaultMaker) {
    if (map.has(key)) {
        return map.get(key);
    }
    return defaultMaker();
}


// Return an backward iterator over an Array.
function *reversed(array) {
    for (let i = array.length - 1; i >= 0; i--) {
        yield array[i];
    }
}


// Return a Array, the reverse topological sort of the nodes `nodes`.
//
// nodesThatNeed: A function that takes a node and returns an Array of nodes
//     that depend on it
function toposort(nodes, nodesThatNeed) {
    const ret = [];
    const todo = new Set(nodes);
    const inProgress = new Set();

    function visit(node) {
        if (inProgress.has(node)) {
            throw new Error('The graph has a cycle.');
        }
        if (todo.has(node)) {
            inProgress.add(node);
            for (let needer of nodesThatNeed(node)) {
                visit(needer);
            }
            inProgress.delete(node);
            todo.delete(node);
            ret.push(node);
        }
    }

    while (todo.size > 0) {
        visit(first(todo));
    }
    return ret;
}


// Return the first item of an iterable.
function first(iterable) {
    for (let i of iterable) {
        return i;
    }
}


module.exports = {
    best,
    collapseWhitespace,
    first,
    getDefault,
    identity,
    inlineTextLength,
    inlineTexts,
    isBlock,
    isWhitespace,
    length,
    linkDensity,
    max,
    maxes,
    min,
    reversed,
    setDefault,
    sum,
    toposort,
    walk
};
