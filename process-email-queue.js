const { createClient } = require('@supabase/supabase-js');
const { sendEmail } = require('./services/mailer/mailer');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function processEmailQueue() {
  try {
    console.log('Processing email queue...');
    
    // Haal pending emails op met FOR UPDATE SKIP LOCKED equivalent
    const { data: pendingEmails, error } = await supabase
      .from('email_queue')
      .select('*')
      .eq('status', 'pending')
      .order('aangemaakt_op')
      .limit(10);
    
    if (error) {
      console.error('Error fetching pending emails:', error);
      return;
    }
    
    if (!pendingEmails || pendingEmails.length === 0) {
      console.log('No pending emails to process');
      return;
    }
    
    console.log(`Found ${pendingEmails.length} pending emails to process`);
    
    for (const email of pendingEmails) {
      try {
        console.log(`Processing email ${email.id} for ${email.ontvanger_email}`);
        
        // Update status naar 'sending' (atomisch)
        const { error: updateError } = await supabase
          .from('email_queue')
          .update({ status: 'sending' })
          .eq('id', email.id)
          .eq('status', 'pending');
        
        if (updateError) {
          console.log(`Email ${email.id} already being processed, skipping`);
          continue;
        }
        
        // Haal template op (of gebruik snapshot)
        let template = null;
        if (email.template_id) {
          const { data: templateData, error: templateError } = await supabase
            .from('email_templates')
            .select('*')
            .eq('id', email.template_id)
            .single();
          
          if (templateError) {
            console.error(`Error fetching template for email ${email.id}:`, templateError);
            // Gebruik snapshot data als fallback
            template = {
              onderwerp: email.template_onderwerp,
              html_content: email.template_naam, // Fallback
              text_content: email.template_naam
            };
          } else {
            template = templateData;
          }
        } else {
          // Gebruik snapshot data
          template = {
            onderwerp: email.template_onderwerp,
            html_content: email.template_naam, // Fallback
            text_content: email.template_naam
          };
        }
        
        // Vervang variabelen in template
        let htmlContent = template.html_content;
        let textContent = template.text_content;
        
        if (email.variabelen) {
          Object.keys(email.variabelen).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            htmlContent = htmlContent.replace(regex, email.variabelen[key]);
            textContent = textContent.replace(regex, email.variabelen[key]);
          });
        }
        
        // Verstuur email
        const result = await sendEmail({
          to: email.ontvanger_email,
          subject: template.onderwerp,
          html: htmlContent,
          text: textContent,
          tag: email.template_trigger,
          metadata: { 
            template_id: email.template_id,
            queue_id: email.id,
            organisatie_id: email.organisatie_id
          }
        });
        
        // Update naar 'sent'
        await supabase
          .from('email_queue')
          .update({ 
            status: 'sent',
            message_id: result.messageId,
            verzonden_op: new Date().toISOString()
          })
          .eq('id', email.id);
        
        // Log in email_logs
        await supabase
          .from('email_logs')
          .insert({
            queue_id: email.id,
            template_id: email.template_id,
            status: 'sent',
            message_id: result.messageId
          });
        
        console.log(`Email ${email.id} sent successfully with message ID: ${result.messageId}`);
        
      } catch (emailError) {
        console.error(`Error processing email ${email.id}:`, emailError);
        
        // Update naar 'failed'
        await supabase
          .from('email_queue')
          .update({ 
            status: 'failed',
            error_message: emailError.message
          })
          .eq('id', email.id);
        
        // Log error
        await supabase
          .from('email_logs')
          .insert({
            queue_id: email.id,
            template_id: email.template_id,
            status: 'failed',
            error_message: emailError.message
          });
      }
    }
    
    console.log('Email queue processing completed');
  } catch (error) {
    console.error('Queue processing error:', error);
  }
}

module.exports = { processEmailQueue };
