<?php
require '/wordpress/wp-load.php';
require_once '/wordpress/wp-content/plugins/cgflight-crm/cgflight-crm.php';
CGFlight_CRM_Connector::activate();
register_post_type('wpcf7_contact_form');
$form = wp_insert_post(array('post_type' => 'wpcf7_contact_form', 'post_title' => 'Main Contact Form', 'post_status' => 'publish'));
wp_set_current_user(1);
$checks = array();
function verify($condition, $name) { global $checks; if (!$condition) { throw new Exception('FAILED: ' . $name); } $checks[] = $name; }
$endpoint = 'https://flight-crm-theta.vercel.app/api/intake/test-only-placeholder-token-12345';
$settings = array('enabled' => true, 'form_id' => $form, 'endpoint' => $endpoint);
update_option(CGFlight_CRM_Connector::OPTION, $settings);
verify(CGFlight_CRM_Connector::valid_endpoint($endpoint), 'accepts only the expected HTTPS intake route');
foreach (array('http://flight-crm-theta.vercel.app/api/intake/test-only-placeholder-token-12345', 'https://evil.example/api/intake/test-only-placeholder-token-12345', $endpoint . '?forward=evil', 'https://user:secret@flight-crm-theta.vercel.app/api/intake/test-only-placeholder-token-12345', 'https://flight-crm-theta.vercel.app:444/api/intake/test-only-placeholder-token-12345') as $bad) {
    verify(!CGFlight_CRM_Connector::valid_endpoint($bad), 'rejects invalid destination ' . count($checks));
}
$fields = array('text-your-name' => 'Test Person', 'email-your-email' => 'test@example.com', 'textarea-message' => 'Question', 'utm_source' => 'youtube', 'utm_content' => 'video-123', 'password' => 'DO NOT FORWARD', 'passport' => 'DO NOT FORWARD', 'attachment' => 'DO NOT FORWARD', '_id' => 'attacker-id');
$payload = CGFlight_CRM_Connector::payload($fields, 'saved-id', $form);
verify(!isset($payload['password']) && !isset($payload['passport']) && !isset($payload['attachment']), 'forwards only approved contact fields');
verify($payload['_id'] === 'saved-id' && $payload['utm_content'] === 'video-123', 'uses a server-generated stable ID and preserves attribution');
verify(CGFlight_CRM_Connector::delay(1) === 60 && CGFlight_CRM_Connector::delay(20) === 3600, 'bounded exponential retry delay');
verify(CGFlight_CRM_Connector::sanitize(array('enabled' => true, 'form_id' => $form, 'endpoint' => 'https://evil.example'))['enabled'] === false, 'invalid settings disable delivery');
$mode = 'failure'; $calls = array();
add_filter('pre_http_request', function ($pre, $args, $url) use (&$mode, &$calls) {
    $calls[] = array('url' => $url, 'payload' => json_decode($args['body'], true), 'args' => $args);
    if ($mode === 'nested') { $mode = 'ok'; CGFlight_CRM_Connector::process(); }
    if ($mode === 'network') { return new WP_Error('timeout', 'untrusted remote secret details'); }
    return array('headers' => array(), 'body' => $mode === 'failure' ? '{"error":"untrusted remote secret details"}' : wp_json_encode(array('ok' => true, 'status' => $mode === 'duplicate' ? 'duplicate' : 'created')), 'response' => array('code' => $mode === 'failure' ? 503 : 200, 'message' => 'Test response'));
}, 10, 3);
function row($id) { global $wpdb; return $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . CGFlight_CRM_Connector::table() . ' WHERE id = %d', $id)); }
$id = CGFlight_CRM_Connector::enqueue($fields, $form);
verify($id > 0 && row($id)->status === 'PENDING', 'persists before making any HTTP request');
verify(count($calls) === 0, 'capture does not block the form on a remote request');
CGFlight_CRM_Connector::process();
$failed = row($id);
verify($failed->status === 'PENDING' && (int) $failed->attempts === 1 && $failed->payload !== '{}', 'transient failure retains customer data for retry');
verify(strpos($failed->last_error, 'untrusted') === false, 'remote response bodies are not logged');
verify(strtotime($failed->available_at . ' UTC') > time(), 'failed delivery waits until backoff expires');
verify($calls[0]['args']['redirection'] === 0 && $calls[0]['args']['sslverify'] === true, 'transport disables redirects and keeps TLS verification');
$wpdb->update(CGFlight_CRM_Connector::table(), array('available_at' => '2000-01-01 00:00:00'), array('id' => $id));
$mode = 'ok'; CGFlight_CRM_Connector::process();
verify(row($id)->status === 'DONE' && row($id)->payload === '{}' && row($id)->endpoint === '', 'success clears the copied customer data and credential');
verify($calls[0]['payload']['_id'] === $calls[1]['payload']['_id'], 'retries reuse the original external ID');
$mode = 'duplicate'; $id = CGFlight_CRM_Connector::enqueue($fields, $form); CGFlight_CRM_Connector::process();
verify(row($id)->status === 'DONE', 'duplicate acknowledgment completes an already-saved delivery');
$mode = 'nested'; $id = CGFlight_CRM_Connector::enqueue($fields, $form); $before = count($calls); CGFlight_CRM_Connector::process();
verify(count($calls) === $before + 1 && row($id)->status === 'DONE', 'an active lease prevents concurrent workers from sending the same job');
$id = CGFlight_CRM_Connector::enqueue($fields, $form);
$wpdb->update(CGFlight_CRM_Connector::table(), array('status' => 'PROCESSING', 'attempts' => 1, 'lease_until' => '2000-01-01 00:00:00'), array('id' => $id));
CGFlight_CRM_Connector::process();
verify(row($id)->status === 'DONE' && (int) row($id)->attempts === 2, 'expired worker leases are recoverable');
$id = CGFlight_CRM_Connector::enqueue($fields, $form);
$wpdb->update(CGFlight_CRM_Connector::table(), array('attempts' => 7), array('id' => $id));
$mode = 'network'; CGFlight_CRM_Connector::process();
verify(row($id)->status === 'FAILED' && row($id)->payload !== '{}', 'attempt exhaustion keeps a recoverable failed delivery');
$id = CGFlight_CRM_Connector::enqueue($fields, $form);
$new = $settings; $new['endpoint'] = 'https://flight-crm-theta.vercel.app/api/intake/different-school-placeholder-12345'; update_option(CGFlight_CRM_Connector::OPTION, $new);
$mode = 'ok'; CGFlight_CRM_Connector::process();
verify(end($calls)['url'] === $endpoint, 'pending deliveries cannot silently switch school when settings change');
$new['enabled'] = false; update_option(CGFlight_CRM_Connector::OPTION, $new); $before = count($calls); CGFlight_CRM_Connector::process();
verify(count($calls) === $before && CGFlight_CRM_Connector::enqueue($fields, $form) === false, 'disabled connection does not enqueue or deliver');
update_option(CGFlight_CRM_Connector::OPTION, $settings);
class WPCF7_Submission { public static function get_instance() { return new self; } public function get_posted_data() { return array('text-your-name' => 'Accepted form', 'email-your-email' => 'accepted@example.com'); } }
$fake = new class($form) { private $id; public function __construct($id) { $this->id = $id; } public function id() { return $this->id; } };
$count = (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . CGFlight_CRM_Connector::table());
foreach (array('spam', 'validation_failed', 'aborted') as $status) { CGFlight_CRM_Connector::capture($fake, array('status' => $status)); }
verify((int) $wpdb->get_var('SELECT COUNT(*) FROM ' . CGFlight_CRM_Connector::table()) === $count, 'spam, invalid and aborted submissions do not enter the CRM');
CGFlight_CRM_Connector::capture($fake, array('status' => 'mail_failed'));
verify((int) $wpdb->get_var('SELECT COUNT(*) FROM ' . CGFlight_CRM_Connector::table()) === $count + 1, 'an accepted inquiry still queues if existing form email fails');
ob_start(); CGFlight_CRM_Connector::page(); $html = ob_get_clean();
verify(strpos($html, 'test-only-placeholder-token-12345') === false && strpos($html, 'test@example.com') === false, 'admin queue does not expose intake tokens or customer payloads');
wp_set_current_user(0); ob_start(); CGFlight_CRM_Connector::page(); $html = ob_get_clean();
verify($html === '', 'connection and queue UI require administrator access');
file_put_contents('/tests/result.json', wp_json_encode(array('passed' => count($checks), 'checks' => $checks), JSON_PRETTY_PRINT));
echo 'Connector checks passed: ' . count($checks);
