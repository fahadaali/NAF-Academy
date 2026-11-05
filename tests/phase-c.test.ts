/* المرحلة ج: الترجمات، والإنجازات، وZoom — دوال نقية */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { toVtt } from '../src/lib/captions'
import { earned } from '../src/lib/achievements'
import { pickRecording, verifyZoom, zoomChallenge, zoomMeetingId } from '../src/lib/zoom'

test('SRT يتحوّل إلى WebVTT، وVTT يبقى، وغير الترجمة يُرفض', () => {
  const srt = '1\r\n00:00:01,000 --> 00:00:03,500\r\nمرحباً\r\n'
  const v = toVtt(srt)!
  assert.match(v, /^WEBVTT\n/)
  assert.match(v, /00:00:01\.000 --> 00:00:03\.500/)
  assert.equal(toVtt('WEBVTT\n\n00:00.000 --> 00:02.000\nنص'), 'WEBVTT\n\n00:00.000 --> 00:02.000\nنص\n')
  assert.equal(toVtt('<script>'), null)
  assert.equal(toVtt('WEBVTT\n\nبلا توقيت'), null)
})

test('الإنجازات من الإحصاءات: لكل دورة ولكل مسار وعامة', () => {
  const g = earned({
    lessonsDone: 4, certificates: 1, attended: 3, perfectQuiz: true,
    courses: [{ id: 'a', pct: 100, trackId: 't' }, { id: 'b', pct: 60, trackId: 't' }, { id: 'c', pct: 100, trackId: null }],
    trackCourses: new Map([['t', ['a', 'b']], ['u', ['c']]]),
  })
  const k = g.map((x) => `${x.kind}:${x.ref}`)
  for (const want of ['first_lesson:', 'halfway:a', 'halfway:b', 'course_complete:a', 'course_complete:c', 'first_certificate:', 'attendee:', 'quiz_ace:']) assert.ok(k.includes(want), want)
  assert.ok(!k.includes('track_complete:t'), 'المسار لم يكتمل (ب 60%)')
  assert.ok(!k.includes('track_complete:u'), 'مسار بدورة واحدة لا يُعدّ')
  assert.ok(!k.includes('three_courses:'))
  assert.deepEqual(earned({ lessonsDone: 0, certificates: 0, attended: 0, perfectQuiz: false, courses: [], trackCourses: new Map() }), [])
})

test('Zoom: رقم الاجتماع، والتوقيع، وتحدي الرابط، واختيار الملف', () => {
  assert.equal(zoomMeetingId('https://us02web.zoom.us/j/81234567890?pwd=abc'), '81234567890')
  assert.equal(zoomMeetingId('https://zoom.us/j/123456789'), '123456789')
  assert.equal(zoomMeetingId('https://teams.microsoft.com/l/x'), null)
  assert.equal(zoomMeetingId('https://evil.com/zoom.us/j/123456789'), null)
  const secret = 'sh'
  const ts = String(Math.floor(Date.now() / 1000))
  const body = '{"event":"x"}'
  const sig = `v0=${createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}`
  assert.equal(verifyZoom(secret, ts, body, sig), true)
  assert.equal(verifyZoom(secret, ts, body + ' ', sig), false)
  assert.equal(verifyZoom(secret, String(Number(ts) - 3600), body, sig), false, 'قديم')
  assert.equal(zoomChallenge(secret, 'p').encryptedToken, createHmac('sha256', secret).update('p').digest('hex'))
  const f = pickRecording([
    { file_type: 'M4A', download_url: 'a' },
    { file_type: 'MP4', recording_type: 'gallery_view', download_url: 'g' },
    { file_type: 'MP4', recording_type: 'shared_screen_with_speaker_view', download_url: 's' },
  ])
  assert.equal(f?.download_url, 's')
  assert.equal(pickRecording([{ file_type: 'M4A', download_url: 'a' }]), null)
})
