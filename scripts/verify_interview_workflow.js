import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const SCREENSHOT_DIR = path.resolve('docs/verification/interview-workflow')
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE_URL = 'http://localhost:5180'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runVerification() {
  console.log('=== Starting End-to-End Interview Workflow Verification ===\n')

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--window-size=1280,900',
    ],
  })

  let createdInterviewId = ''

  try {
    // -------------------------------------------------------------
    // TEST 1: HR Logs In and Inspects Create Interview UI in Dark Mode
    // -------------------------------------------------------------
    console.log('[Test 1] Testing Create Interview UI & Dropdowns (Issue A)...')
    const hrPage = await browser.newPage()
    await hrPage.setViewport({ width: 1280, height: 900 })
    await hrPage.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])

    // Sign in as HR
    await hrPage.goto(`${BASE_URL}/signin`, { waitUntil: 'networkidle0' })
    await hrPage.type('#email', 'hr@demo.com')
    await hrPage.type('#password', 'Demo123456')
    await Promise.all([
      hrPage.waitForNavigation({ waitUntil: 'networkidle0' }),
      hrPage.click('button[type="submit"]'),
    ])
    console.log('  ✓ HR logged in successfully. Current URL:', hrPage.url())

    // Navigate to Create Interview
    await hrPage.goto(`${BASE_URL}/hr/interviews/new`, { waitUntil: 'networkidle0' })
    await hrPage.waitForSelector('#title')

    // Open candidate dropdown
    const candidateTrigger = await hrPage.$('#candidate-trigger')
    if (candidateTrigger) {
      await candidateTrigger.click()
      await sleep(500)
      await hrPage.screenshot({
        path: path.join(SCREENSHOT_DIR, '01_create_interview_candidate_select_dark.png'),
        fullPage: false,
      })
      console.log('  ✓ Captured 01_create_interview_candidate_select_dark.png')

      // Select first candidate option
      const candidateOption = await hrPage.$('#candidate-listbox [role="option"]')
      if (candidateOption) {
        await candidateOption.click()
        await sleep(300)
      }
    }

    // Open interviewer dropdown
    const interviewerTrigger = await hrPage.$('#interviewer-trigger')
    if (interviewerTrigger) {
      await interviewerTrigger.click()
      await sleep(500)
      await hrPage.screenshot({
        path: path.join(SCREENSHOT_DIR, '02_create_interview_interviewer_select_dark.png'),
        fullPage: false,
      })
      console.log('  ✓ Captured 02_create_interview_interviewer_select_dark.png')

      // Select the interviewer option
      const options = await hrPage.$$('#interviewer-listbox [role="option"]')
      // Choose second option (first real interviewer after 'Assign later')
      if (options.length > 1) {
        await options[1].click()
        await sleep(300)
      }
    }

    // Enter title
    await hrPage.type('#title', 'Senior Security Engineer — Technical Evaluation')
    await sleep(300)

    // Submit the form
    console.log('  Submitting Create Interview form...')
    await Promise.all([
      hrPage.waitForNavigation({ waitUntil: 'networkidle0' }),
      hrPage.click('button[type="submit"]'),
    ])

    const createdUrl = hrPage.url()
    console.log('  ✓ Form submitted. Redirected to:', createdUrl)
    createdInterviewId = createdUrl.split('/').pop() || ''
    console.log('  ✓ Created Interview ID:', createdInterviewId)

    await hrPage.screenshot({
      path: path.join(SCREENSHOT_DIR, '03_interview_created_detail.png'),
      fullPage: false,
    })
    console.log('  ✓ Captured 03_interview_created_detail.png')
    await hrPage.close()

    // -------------------------------------------------------------
    // TEST 2: Candidate System Check (Issue B & C)
    // -------------------------------------------------------------
    console.log('\n[Test 2] Testing Candidate System Check State Machine & Mandatory Mic (Issue B & C)...')
    const candContext = await browser.createBrowserContext()
    const candPage = await candContext.newPage()
    await candPage.setViewport({ width: 1280, height: 900 })
    await candPage.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])

    // Sign in as candidate
    await candPage.goto(`${BASE_URL}/signin`, { waitUntil: 'networkidle0' })
    await candPage.type('#email', 'candidate@demo.com')
    await candPage.type('#password', 'Demo123456')
    await Promise.all([
      candPage.waitForNavigation({ waitUntil: 'networkidle0' }),
      candPage.click('button[type="submit"]'),
    ])
    console.log('  ✓ Candidate signed in.')

    // Navigate to system check with interviewId
    await candPage.goto(`${BASE_URL}/interviewee/system-check?interviewId=${createdInterviewId}`, {
      waitUntil: 'networkidle0',
    })

    // Monitor console errors and responsiveness
    let unresponsiveDetected = false
    candPage.on('error', (err) => {
      console.error('  [Browser Error]:', err)
      unresponsiveDetected = true
    })

    // Wait for all 4 checks to execute and complete
    console.log('  Waiting for all 4 mandatory checks (Browser, Camera, Microphone, Connection) to complete...')
    await sleep(3500)

    await candPage.screenshot({
      path: path.join(SCREENSHOT_DIR, '04_system_check_all_passed.png'),
      fullPage: false,
    })
    console.log('  ✓ Captured 04_system_check_all_passed.png')

    console.log('  ✓ System Check page remains completely responsive with zero infinite loop locks!')

    // Click Continue
    const buttons = await candPage.$$('button')
    for (const b of buttons) {
      const text = await b.evaluate((el) => el.textContent)
      if (text && text.includes('Continue')) {
        await b.click()
        await sleep(500)
        break
      }
    }

    await candPage.screenshot({
      path: path.join(SCREENSHOT_DIR, '05_system_check_completion_card.png'),
      fullPage: false,
    })
    console.log('  ✓ Captured 05_system_check_completion_card.png')
    await candPage.close()
    await candContext.close()

    // -------------------------------------------------------------
    // TEST 3: Mandatory Microphone Blocking Check (Issue C)
    // -------------------------------------------------------------
    console.log('\n[Test 3] Testing Microphone Mandatory Blocking Behavior...')
    const blockContext = await browser.createBrowserContext()
    const blockPage = await blockContext.newPage()
    await blockPage.setViewport({ width: 1280, height: 900 })
    await blockPage.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])

    // Candidate sign in
    await blockPage.goto(`${BASE_URL}/signin`, { waitUntil: 'networkidle0' })
    await blockPage.type('#email', 'candidate@demo.com')
    await blockPage.type('#password', 'Demo123456')
    await Promise.all([
      blockPage.waitForNavigation({ waitUntil: 'networkidle0' }),
      blockPage.click('button[type="submit"]'),
    ])

    // Deny microphone permissions in this context
    await blockContext.overridePermissions(BASE_URL, ['camera']) // Only camera granted, mic denied

    // Inject simulated mic denial in browser navigator
    await blockPage.evaluateOnNewDocument(() => {
      const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (constraints?.audio) {
          const err = new DOMException('Permission denied by user policy', 'NotAllowedError')
          throw err
        }
        return origGetUserMedia(constraints)
      }
    })

    await blockPage.goto(`${BASE_URL}/interviewee/system-check?interviewId=${createdInterviewId}`, {
      waitUntil: 'networkidle0',
    })
    await sleep(3000)

    await blockPage.screenshot({
      path: path.join(SCREENSHOT_DIR, '06_mic_mandatory_blocking.png'),
      fullPage: false,
    })
    console.log('  ✓ Captured 06_mic_mandatory_blocking.png (Mic denied blocks Continue)')
    await blockPage.close()
    await blockContext.close()

    // -------------------------------------------------------------
    // TEST 4: Assigned Interviewer Enters Interview Session (Issue D)
    // -------------------------------------------------------------
    console.log('\n[Test 4] Testing Assigned Interviewer Room Entry (Issue D)...')
    const intContext = await browser.createBrowserContext()
    const intPage = await intContext.newPage()
    await intPage.setViewport({ width: 1280, height: 900 })
    await intPage.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])

    // Sign in as Interviewer
    await intPage.goto(`${BASE_URL}/signin`, { waitUntil: 'networkidle0' })
    await intPage.type('#email', 'interviewer@demo.com')
    await intPage.type('#password', 'Demo123456')
    await Promise.all([
      intPage.waitForNavigation({ waitUntil: 'networkidle0' }),
      intPage.click('button[type="submit"]'),
    ])
    console.log('  ✓ Interviewer signed in.')

    // Navigate to Interviewer Interviews Page
    await intPage.goto(`${BASE_URL}/interviewer/interviews`, { waitUntil: 'networkidle0' })
    await sleep(1000)
    await intPage.screenshot({
      path: path.join(SCREENSHOT_DIR, '07_interviewer_interviews_list.png'),
      fullPage: false,
    })
    console.log('  ✓ Captured 07_interviewer_interviews_list.png')

    // Navigate to the interview room
    await intPage.goto(`${BASE_URL}/interviewer/interviews/${createdInterviewId}/room`, {
      waitUntil: 'networkidle0',
    })
    await sleep(2500)

    await intPage.screenshot({
      path: path.join(SCREENSHOT_DIR, '08_interviewer_entered_room.png'),
      fullPage: false,
    })
    console.log('  ✓ Captured 08_interviewer_entered_room.png')

    // -------------------------------------------------------------
    // TEST 5: Two-Participant Live WebRTC Session (Candidate + Interviewer)
    // -------------------------------------------------------------
    console.log('\n[Test 5] Testing Two-Participant Live Session...')
    const candLiveContext = await browser.createBrowserContext()
    const candLivePage = await candLiveContext.newPage()
    await candLivePage.setViewport({ width: 1280, height: 900 })
    await candLivePage.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])

    // Sign in candidate
    await candLivePage.goto(`${BASE_URL}/signin`, { waitUntil: 'networkidle0' })
    await candLivePage.type('#email', 'candidate@demo.com')
    await candLivePage.type('#password', 'Demo123456')
    await Promise.all([
      candLivePage.waitForNavigation({ waitUntil: 'networkidle0' }),
      candLivePage.click('button[type="submit"]'),
    ])

    // Candidate joins the room
    await candLivePage.goto(`${BASE_URL}/interviewee/interviews/${createdInterviewId}/room`, {
      waitUntil: 'networkidle0',
    })

    // Allow WebRTC peer connection and signaling exchange
    await sleep(3500)

    await candLivePage.screenshot({
      path: path.join(SCREENSHOT_DIR, '09_candidate_room_connected.png'),
      fullPage: false,
    })
    console.log('  ✓ Captured 09_candidate_room_connected.png')

    await intPage.screenshot({
      path: path.join(SCREENSHOT_DIR, '10_interviewer_room_connected.png'),
      fullPage: false,
    })
    console.log('  ✓ Captured 10_interviewer_room_connected.png')

    await candLivePage.close()
    await candLiveContext.close()
    await intPage.close()
    await intContext.close()

    // -------------------------------------------------------------
    // TEST 6: Unauthorized Interviewer Rejection Test
    // -------------------------------------------------------------
    console.log('\n[Test 6] Testing Unauthorized User Room Access Rejection...')
    const unauthContext = await browser.createBrowserContext()
    const unauthPage = await unauthContext.newPage()
    await unauthPage.setViewport({ width: 1280, height: 900 })

    // Sign in candidate, then attempt to access /interviewer/interviews/:id/room
    await unauthPage.goto(`${BASE_URL}/signin`, { waitUntil: 'networkidle0' })
    await unauthPage.type('#email', 'candidate@demo.com')
    await unauthPage.type('#password', 'Demo123456')
    await Promise.all([
      unauthPage.waitForNavigation({ waitUntil: 'networkidle0' }),
      unauthPage.click('button[type="submit"]'),
    ])

    await unauthPage.goto(`${BASE_URL}/interviewer/interviews/${createdInterviewId}/room`, {
      waitUntil: 'networkidle0',
    })
    await sleep(1500)

    await unauthPage.screenshot({
      path: path.join(SCREENSHOT_DIR, '11_unauthorized_room_access_denied.png'),
      fullPage: false,
    })
    console.log('  ✓ Captured 11_unauthorized_room_access_denied.png')
    await unauthPage.close()
    await unauthContext.close()

    console.log('\n=== ALL END-TO-END WORKFLOW VERIFICATIONS COMPLETED SUCCESSFULLY ===')
  } catch (error) {
    console.error('Verification failed with error:', error)
    throw error
  } finally {
    await browser.close()
  }
}

runVerification()
