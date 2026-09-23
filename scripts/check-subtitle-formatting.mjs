import assert from 'node:assert/strict'
import { cleanEnglishAnswerText, toDraftLine, toTranscriptLines } from '../admin/src/lib/mediaDraftTools.ts'

const cases = [
  ['bbclearningenglish.com.', 'bbclearningenglish.com.'],
  ['Visit bbclearningenglish.com. Thank you!', 'Visit bbclearningenglish.com. Thank you!'],
  ['(www.bbc.co.uk).', '(www.bbc.co.uk).'],
  ['https://example.com:8080/a,b?q=hello,world!yes#part.', 'https://example.com:8080/a,b?q=hello,world!yes#part.'],
  ['user.name+tag@example.com.', 'user.name+tag@example.com.'],
  ['https://例子.测试/a?x=1,2', 'https://例子.测试/a?x=1,2'],
  ['192.168.1.1:8080', '192.168.1.1:8080'],
  ['It costs $1,000.50.', 'It costs $1,000.50.'],
  ['3.14 and v1.2.3', '3.14 and v1.2.3'],
  ['U.S.A. and e.g. and a.m.', 'U.S.A. and e.g. and a.m.'],
  ['Mr.Dinosaur and Mrs. Pig', 'Mr.Dinosaur and Mrs. Pig'],
  ['Hello.World', 'Hello.World'],
  ['Hello,world!How are you?', 'Hello, world! How are you?'],
  ['Hello，world！', 'Hello, world!'],
  ['  Hello  , world  !  ', 'Hello, world!'],
  ['It is 5: 00.', 'It is 5:00.'],
  ['Note:hello', 'Note: hello'],
  ['Hello,world at example.com. Bye,now!', 'Hello, world at example.com. Bye, now!'],
  ['bbclearningenglish. com.', 'bbclearningenglish. com.'],
]
for (const [input, expected] of cases) {
  const result = cleanEnglishAnswerText(input)
  assert.equal(result, expected, input)
  assert.equal(cleanEnglishAnswerText(result), result, `Not idempotent: ${input}`)
}
const line = toDraftLine({ id: 'line-1', start: 1.25, end: 3.75, text: 'bbclearningenglish.com.', answers: ['user.name@example.com', '1,000'], translations: { 'fr-FR': 'Une traduction.' } })
const saved = toTranscriptLines([line])[0]
assert.equal(saved.text, line.text)
assert.deepEqual(saved.answers, line.answers)
assert.equal(saved.start, 1.25)
assert.equal(saved.end, 3.75)
assert.equal(saved.translations['fr-FR'], 'Une traduction.')
console.log(`Subtitle formatting checks passed: ${cases.length} cases, repeat formatting, and save/submit serialization.`)
