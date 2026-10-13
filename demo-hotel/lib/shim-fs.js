const unavailable = () => { throw new Error('sin disco en la demo'); };
export default { readFileSync: unavailable, writeFileSync: unavailable, mkdirSync: unavailable, renameSync: unavailable };
