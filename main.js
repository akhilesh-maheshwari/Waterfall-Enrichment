// ──────────────────────────────
  // 5. TRIGGER N8N
  // ──────────────────────────────
  console.log('Triggering n8n workflow...');

  const n8nRes = await fetch(
    'https://n8n-internal.chitlangia.co/webhook/waterfall-input',
    {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        userId,
        runId,
        time,
        serviceTagName,
        rowCount,
        creditsCost,
        csvContent,    // ← filled if manual entry, empty if file URL
        uploadedFile,  // ← filled if file URL, empty if manual entry
        fileName
      })
    }
  );

  console.log('n8n trigger status:', n8nRes.status);
  const n8nText = await n8nRes.text();
  console.log('n8n response:', n8nText);

  if (n8nRes.status === 200) {
    console.log('✅ n8n triggered successfully!');
  } else {
    console.log('❌ n8n trigger failed:', n8nText);
  }
