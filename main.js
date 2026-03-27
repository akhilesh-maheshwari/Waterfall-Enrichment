import { Actor } from 'apify';

await Actor.init();

try {

  // ──────────────────────────────
  // 1. GET INPUT
  // ──────────────────────────────
  const input           = await Actor.getInput();
  const entries         = input.entries               || '';
  const uploadedFile    = input.uploadedFile          || '';
  const serviceTagName  = input.serviceRequestTagName || '';
  const serviceName     = input.serviceName           || 'Waterfall Enrichment';
  const serviceOption1  = input.serviceOption1        || 'pro';
  const requestSource   = input.requestSource         || 'Waterfall_enrichment_AP';
  const boomerangInputUrl  = input.boomerangInputUrl  || 'https://s1.boomerangserver.co.in/webhook/waterfall-live';

  console.log('Tag Name :', serviceTagName);
  console.log('Service  :', serviceName);
  console.log('Entries  :', entries ? 'Yes' : 'No');
  console.log('File URL :', uploadedFile ? 'Yes' : 'No');

  // ──────────────────────────────
  // 2. BUILD CSV CONTENT
  // ──────────────────────────────
  let csvContent = '';
  let fileName   = '';
  let rowCount   = 0;

  if (entries && entries.trim()) {

    console.log('Processing manual entries...');
    const lines = entries.trim().split('\n').map(l => l.trim()).filter(l => l);

    const validLines = [];
    for (const line of lines) {
      const cols = line.split(',');
      if (cols.length === 3) {
        validLines.push(cols.map(c => c.trim()).join(','));
      } else {
        validLines.push(line.trim());
      }
    }

    const hasThreeCols = validLines[0] && validLines[0].split(',').length === 3;
    const header = hasThreeCols ? 'first_name,last_name,domain' : 'url';

    csvContent = header + '\n' + validLines.join('\n');
    rowCount   = validLines.length;
    fileName   = serviceTagName.replace(/[^a-zA-Z0-9]/g, '_') + '_' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv';

    console.log('Valid rows:', rowCount);
    console.log('CSV preview:\n', csvContent.split('\n').slice(0, 3).join('\n'));

  } else if (uploadedFile && uploadedFile.trim()) {

    console.log('Processing file URL...');
    let csvUrl = uploadedFile.trim();

    if (csvUrl.includes('docs.google.com/spreadsheets')) {
      const match = csvUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match) {
        csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=0`;
        console.log('Converted URL:', csvUrl);
      }
    }

    const csvRes  = await fetch(csvUrl);
    csvContent    = await csvRes.text();

    const allRows = csvContent.trim().split('\n');
    rowCount      = allRows.length - 1;
    fileName      = serviceTagName.replace(/[^a-zA-Z0-9]/g, '_') + '_' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv';

    console.log('Downloaded rows:', rowCount);
    console.log('CSV preview:\n', allRows.slice(0, 3).join('\n'));

  } else {
    throw new Error('Please provide either manual entries or a file URL!');
  }

  // ──────────────────────────────
  // 3. GET APIFY RUN DETAILS
  // ──────────────────────────────
  const env    = Actor.getEnv();
  const userId = env.userId     || 'unknown';
  const runId  = env.actorRunId || 'unknown';
  const now    = new Date();
  const time   = now.toLocaleString('en-US', {
    year    : 'numeric',
    month   : 'long',
    day     : 'numeric',
    hour    : 'numeric',
    minute  : '2-digit',
    hour12  : true,
    timeZone: 'Asia/Kolkata'
  });

  console.log('User ID:', userId);
  console.log('Run ID :', runId);
  console.log('Time   :', time);

  // ──────────────────────────────
  // 4. CALCULATE COST
  // ──────────────────────────────
  const creditsCost = parseFloat((rowCount * 0.015).toFixed(3));
  console.log('Row count   :', rowCount);
  console.log('Credits cost: $', creditsCost);

  // ──────────────────────────────
  // 5. TRIGGER WORKFLOW 1
  // ──────────────────────────────
  console.log('\nStep 1: Triggering n8n master webhook...');

  let wf1Res;
  try {
    wf1Res = await fetch(
      'https://n8n-internal.chitlangia.co/webhook/master_webhook',
      {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal : AbortSignal.timeout(60000),
        body   : JSON.stringify({
          userId,
          runId,
          time,
          serviceTagName,
          rowCount,
          creditsCost,
          csvContent,
          uploadedFile,
          fileName,
          boomerangInputUrl,
          service_option_1 : serviceOption1,
          service_name     : serviceName,
          request_source   : requestSource
        })
      }
    );
  } catch (fetchErr) {
    throw new Error(`Step 1 fetch failed: ${fetchErr.message}`);
  }

  console.log('n8n step 1 status:', wf1Res.status);

  const wf1Text = await wf1Res.text();
  console.log('n8n step 1 raw response:', wf1Text);

  if (!wf1Res.ok) throw new Error(`Step 1 failed with status ${wf1Res.status}. Response: ${wf1Text.slice(0, 200)}`);

  let wf1Data;
  try {
    wf1Data = JSON.parse(wf1Text);
  } catch (e) {
    throw new Error(`Step 1 JSON parse failed. Raw response: ${wf1Text.slice(0, 200)}`);
  }

  console.log('n8n step 1 response:', JSON.stringify(wf1Data));

  const request_unique_id = wf1Data.request_unique_id || '';
  const masterFileUrl     = wf1Data.masterFileUrl     || '';
  const total_batches     = parseInt(wf1Data.total_batches || '0');
  const batchFolderId     = wf1Data.batchFolderId     || '';

  if (!request_unique_id) throw new Error('No request_unique_id returned from Step 1!');

  console.log('\n✅ Step 1 Complete!');
  console.log('Request ID    :', request_unique_id);
  console.log('Master File   :', masterFileUrl);
  console.log('Total Batches :', total_batches);

  // ──────────────────────────────
  // 6. LOOP — Process 5 batches at a time via Workflow 2
  // ──────────────────────────────
  let completedBatches = 0;
  let round            = 0;
  let allOutputLinks   = [];

  while (completedBatches < total_batches) {

    round++;
    const remaining = total_batches - completedBatches;
    const thisBatch = Math.min(5, remaining);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Step 2: Round ${round} — Processing ${thisBatch} batch(es)...`);
    console.log(`Completed so far : ${completedBatches}/${total_batches}`);
    console.log(`Remaining        : ${remaining}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    let wf2Res;
    try {
      wf2Res = await fetch(
        'https://n8n-internal.chitlangia.co/webhook/batch-process',
        {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal : AbortSignal.timeout(30 * 60 * 1000),
          body   : JSON.stringify({
            request_unique_id,
            batchFolderId,
            userId,
            runId,
            time,
            serviceTagName,
            rowCount,
            creditsCost,
            boomerangInputUrl,
            service_option_1 : serviceOption1,
            service_name     : serviceName,
            request_source   : requestSource
          })
        }
      );
    } catch (fetchErr) {
      throw new Error(`Step 2 Round ${round} failed: ${fetchErr.message}`);
    }

    console.log('n8n step 2 status:', wf2Res.status);

    const wf2Text = await wf2Res.text();
    console.log('n8n step 2 raw response:', wf2Text);

    if (!wf2Res.ok) throw new Error(`Step 2 error: ${wf2Text.slice(0, 200)}`);

    let wf2Data;
    try {
      wf2Data = JSON.parse(wf2Text);
    } catch (e) {
      throw new Error(`Step 2 JSON parse failed: ${wf2Text.slice(0, 200)}`);
    }

    console.log('n8n step 2 response:', JSON.stringify(wf2Data));

    // Log each batch output
    const batchResults = wf2Data.batchResults || [];

    console.log(`\n✅ Round ${round} Complete! Results:`);
    for (const batch of batchResults) {
      console.log(`\n  📦 Batch ${batch.batch_number}:`);
      console.log(`     Status         : ${batch.status}`);
      console.log(`     Emails Found   : ${batch.email_found}`);
      console.log(`     Emails Missing : ${batch.email_not_found}`);
      console.log(`     Output Link    : ${batch.output_url}`);
      allOutputLinks.push(batch.output_url);
    }

    completedBatches += batchResults.length;

    // Save round results to Apify dataset
    await Actor.pushData({
      round,
      request_unique_id,
      completedBatches,
      total_batches,
      batchResults
    });

    if (completedBatches < total_batches) {
      console.log(`\n⏳ ${total_batches - completedBatches} batch(es) remaining. Starting next round...`);
    }
  }

  // ──────────────────────────────
  // 7. ALL DONE
  // ──────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 ALL BATCHES COMPLETED!');
  console.log('Request ID    :', request_unique_id);
  console.log('Master File   :', masterFileUrl);
  console.log('Total Batches :', total_batches);
  console.log('\nAll Output Links:');
  allOutputLinks.forEach((link, i) => console.log(`  Batch ${i + 1} : ${link}`));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await Actor.pushData({
    status           : 'completed',
    request_unique_id,
    total_batches,
    masterFileUrl,
    allOutputLinks
  });

} catch (err) {
  console.log('❌ Error:', err.message);
}

await Actor.exit();
