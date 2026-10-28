<?php
/**
 * Plugin Name: CG Flight CRM Contact Connector
 * Description: Queues the selected Contact Form 7 form for reliable delivery to the academy CRM.
 * Version: 1.0.0
 * Requires PHP: 7.4
 */
if (!defined('ABSPATH')) { exit; }

final class CGFlight_CRM_Connector {
    const OPTION = 'cgflight_crm_connection';
    const HOOK = 'cgflight_crm_deliver';
    const MAX_ATTEMPTS = 8;

    public static function init() {
        add_filter('cron_schedules', array(__CLASS__, 'schedules'));
        add_action(self::HOOK, array(__CLASS__, 'process'));
        add_action('wpcf7_submit', array(__CLASS__, 'capture'), 30, 2);
        add_action('admin_menu', function () { add_options_page('CRM website connection', 'CRM website connection', 'manage_options', 'cgflight-crm', array(__CLASS__, 'page')); });
        add_action('admin_init', function () { register_setting('cgflight_crm', self::OPTION, array('sanitize_callback' => array(__CLASS__, 'sanitize'))); });
        add_action('admin_post_cgflight_crm_retry', array(__CLASS__, 'retry'));
        add_action('admin_post_cgflight_crm_process', array(__CLASS__, 'manual_process'));
    }
    public static function table() { global $wpdb; return $wpdb->prefix . 'cgflight_crm_queue'; }
    public static function settings() { return wp_parse_args(get_option(self::OPTION, array()), array('enabled' => false, 'form_id' => 0, 'endpoint' => '')); }
    public static function schedules($schedules) { $schedules['cgflight_minute'] = array('interval' => 60, 'display' => 'Every minute (CRM)'); return $schedules; }
    public static function activate() {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $table = self::table(); $charset = $wpdb->get_charset_collate();
        dbDelta("CREATE TABLE $table (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            delivery_key varchar(120) NOT NULL,
            form_id bigint(20) unsigned NOT NULL,
            endpoint varchar(255) NOT NULL,
            payload longtext NOT NULL,
            status varchar(16) NOT NULL DEFAULT 'PENDING',
            attempts smallint unsigned NOT NULL DEFAULT 0,
            available_at datetime NOT NULL,
            lease_until datetime DEFAULT NULL,
            lease_key varchar(36) NOT NULL DEFAULT '',
            last_error varchar(191) NOT NULL DEFAULT '',
            created_at datetime NOT NULL,
            completed_at datetime DEFAULT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY delivery_key (delivery_key),
            KEY due (status,available_at)
        ) $charset;");
        if (!wp_next_scheduled(self::HOOK)) { wp_schedule_event(time() + 60, 'cgflight_minute', self::HOOK); }
    }
    public static function deactivate() { wp_clear_scheduled_hook(self::HOOK); }
    public static function valid_endpoint($endpoint) {
        $url = wp_parse_url($endpoint);
        return is_array($url) && ($url['scheme'] ?? '') === 'https' && ($url['host'] ?? '') === 'flight-crm-theta.vercel.app'
            && (!isset($url['port']) || $url['port'] === 443) && !isset($url['user']) && !isset($url['pass'])
            && !isset($url['query']) && !isset($url['fragment']) && preg_match('~^/api/intake/[A-Za-z0-9_-]{20,64}$~D', $url['path'] ?? '') === 1;
    }
    public static function sanitize($input) {
        $old = self::settings();
        if (!current_user_can('manage_options')) { return $old; }
        $endpoint = trim((string) ($input['endpoint'] ?? ''));
        if ($endpoint === '') { $endpoint = $old['endpoint']; }
        $form = absint($input['form_id'] ?? 0);
        if (!self::valid_endpoint($endpoint) || get_post_type($form) !== 'wpcf7_contact_form') {
            add_settings_error(self::OPTION, 'invalid', 'Choose a Contact Form 7 form and its HTTPS CRM intake URL. Connection remains disabled.');
            return array('enabled' => false, 'form_id' => $old['form_id'], 'endpoint' => $old['endpoint']);
        }
        return array('enabled' => !empty($input['enabled']), 'form_id' => $form, 'endpoint' => $endpoint);
    }
    public static function payload($fields, $key, $form_id) {
        // Deliberate allowlist: no uploads, passwords, cookies, IP addresses or application documents.
        $allowed = array('text-your-name', 'email-your-email', 'textarea-message', 'your-name', 'your-email', 'your-phone', 'your-message', 'your-subject', 'program', 'language', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term');
        $payload = array('_id' => $key, 'form_id' => (string) $form_id, 'submitted_at' => gmdate('c'));
        foreach ($allowed as $field) {
            if (!isset($fields[$field])) { continue; }
            $value = $fields[$field];
            if (is_array($value)) { $value = implode(', ', array_filter($value, 'is_scalar')); }
            if (is_scalar($value)) { $payload[$field] = mb_substr(sanitize_textarea_field((string) $value), 0, 2000); }
        }
        return $payload;
    }
    public static function capture($form, $result) {
        $settings = self::settings();
        if (!$settings['enabled'] || (int) $form->id() !== (int) $settings['form_id'] || !in_array($result['status'] ?? '', array('mail_sent', 'mail_failed'), true)) { return; }
        if (!class_exists('WPCF7_Submission')) { return; }
        $submission = WPCF7_Submission::get_instance();
        if (!$submission) { return; }
        try { self::enqueue($submission->get_posted_data(), (int) $form->id()); }
        catch (Throwable $error) { update_option('cgflight_crm_capture_error', 'A submission could not be queued. Reconcile it from Flamingo before retrying.', false); }
    }
    public static function enqueue($fields, $form_id) {
        global $wpdb;
        $settings = self::settings();
        if (!$settings['enabled'] || (int) $settings['form_id'] !== (int) $form_id || !self::valid_endpoint($settings['endpoint'])) { return false; }
        $key = 'wp:' . substr(hash('sha256', home_url('/')), 0, 12) . ':' . wp_generate_uuid4();
        $now = gmdate('Y-m-d H:i:s');
        $saved = $wpdb->insert(self::table(), array('delivery_key' => $key, 'form_id' => $form_id, 'endpoint' => $settings['endpoint'], 'payload' => wp_json_encode(self::payload($fields, $key, $form_id)), 'status' => 'PENDING', 'attempts' => 0, 'available_at' => $now, 'created_at' => $now));
        if (!$saved) { throw new RuntimeException('Queue save failed'); }
        return (int) $wpdb->insert_id;
    }
    public static function delay($attempt) { return min(3600, 60 * (2 ** max(0, $attempt - 1))); }
    public static function accepted($response) {
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) < 200 || wp_remote_retrieve_response_code($response) >= 300) { return false; }
        $body = json_decode(wp_remote_retrieve_body($response), true);
        return is_array($body) && ($body['ok'] ?? false) === true && in_array($body['status'] ?? '', array('created', 'merged', 'duplicate'), true);
    }
    public static function process() {
        global $wpdb;
        if (!self::settings()['enabled']) { return; }
        $table = self::table(); $now = gmdate('Y-m-d H:i:s');
        $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM $table WHERE (status = 'PENDING' AND available_at <= %s) OR (status = 'PROCESSING' AND lease_until < %s) ORDER BY id ASC LIMIT 2", $now, $now));
        foreach ($rows as $row) {
            $lease = wp_generate_uuid4();
            $claimed = $wpdb->query($wpdb->prepare("UPDATE $table SET status = 'PROCESSING', attempts = attempts + 1, lease_until = %s, lease_key = %s WHERE id = %d AND ((status = 'PENDING' AND available_at <= %s) OR (status = 'PROCESSING' AND lease_until < %s))", gmdate('Y-m-d H:i:s', time() + 120), $lease, $row->id, $now, $now));
            if ($claimed !== 1) { continue; }
            $attempt = (int) $row->attempts + 1;
            if ($attempt > self::MAX_ATTEMPTS || !self::valid_endpoint($row->endpoint)) {
                $wpdb->update($table, array('status' => 'FAILED', 'lease_until' => null, 'lease_key' => '', 'last_error' => 'Retry limit reached or saved destination is invalid.'), array('id' => $row->id, 'lease_key' => $lease));
                continue;
            }
            $response = wp_safe_remote_post($row->endpoint, array('timeout' => 8, 'redirection' => 0, 'sslverify' => true, 'headers' => array('Content-Type' => 'application/json'), 'body' => $row->payload));
            if (self::accepted($response)) {
                // Keep delivery metadata but remove customer data and the intake credential after success.
                $wpdb->update($table, array('status' => 'DONE', 'payload' => '{}', 'endpoint' => '', 'completed_at' => gmdate('Y-m-d H:i:s'), 'last_error' => '', 'lease_until' => null, 'lease_key' => ''), array('id' => $row->id, 'lease_key' => $lease));
            } else {
                $error = is_wp_error($response) ? 'Connection error; saved for retry.' : 'HTTP ' . (int) wp_remote_retrieve_response_code($response) . '; no valid CRM acknowledgment.';
                $wpdb->update($table, array('status' => $attempt >= self::MAX_ATTEMPTS ? 'FAILED' : 'PENDING', 'available_at' => gmdate('Y-m-d H:i:s', time() + self::delay($attempt)), 'last_error' => $error, 'lease_until' => null, 'lease_key' => ''), array('id' => $row->id, 'lease_key' => $lease));
            }
        }
    }
    public static function retry() {
        if (!current_user_can('manage_options')) { wp_die('Not allowed.'); }
        $id = absint($_POST['job_id'] ?? 0); check_admin_referer('cgflight_retry_' . $id);
        global $wpdb;
        $wpdb->update(self::table(), array('status' => 'PENDING', 'attempts' => 0, 'available_at' => gmdate('Y-m-d H:i:s'), 'last_error' => ''), array('id' => $id, 'status' => 'FAILED'));
        wp_safe_redirect(admin_url('options-general.php?page=cgflight-crm')); exit;
    }
    public static function manual_process() {
        if (!current_user_can('manage_options')) { wp_die('Not allowed.'); }
        check_admin_referer('cgflight_process'); self::process();
        wp_safe_redirect(admin_url('options-general.php?page=cgflight-crm')); exit;
    }
    public static function page() {
        if (!current_user_can('manage_options')) { return; }
        $settings = self::settings(); global $wpdb;
        echo '<div class="wrap"><h1>CRM website connection</h1><p>Send the selected contact form to the CRM. Existing form design, saved Flamingo messages and email notifications continue to work.</p>';
        settings_errors(self::OPTION);
        $error = get_option('cgflight_crm_capture_error');
        if ($error) { echo '<div class="notice notice-error"><p>' . esc_html($error) . '</p></div>'; }
        echo '<form method="post" action="options.php">'; settings_fields('cgflight_crm');
        echo '<table class="form-table"><tr><th>Contact form</th><td><select name="' . self::OPTION . '[form_id]">';
        foreach (get_posts(array('post_type' => 'wpcf7_contact_form', 'numberposts' => 100, 'orderby' => 'title', 'order' => 'ASC')) as $form) {
            echo '<option value="' . (int) $form->ID . '" ' . selected($settings['form_id'], $form->ID, false) . '>' . esc_html($form->post_title) . '</option>';
        }
        echo '</select><p class="description">Select Main Contact Form. Keep shop reservations and student application documents separate.</p></td></tr><tr><th>CRM intake URL</th><td><input class="large-text" type="password" autocomplete="new-password" name="' . self::OPTION . '[endpoint]" value="" placeholder="' . ($settings['endpoint'] ? 'Saved. Leave blank to keep the connection.' : 'Paste the private CRM intake URL') . '"><p class="description">Saved server-side; not included in public pages. Pending deliveries keep their original destination.</p></td></tr><tr><th>Delivery</th><td><label><input type="checkbox" name="' . self::OPTION . '[enabled]" value="1" ' . checked($settings['enabled'], true, false) . '> Enable delivery to CRM</label></td></tr></table>';
        submit_button('Save connection'); echo '</form><h2>Delivery queue</h2><p>WordPress scheduled tasks retry failures automatically, up to eight attempts. WordPress scheduling needs site traffic or a server cron. Completed entries no longer retain customer data. To pause delivery, uncheck Enable delivery or deactivate this plugin; pending entries remain saved.</p>';
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="cgflight_crm_process">'; wp_nonce_field('cgflight_process'); submit_button('Process pending deliveries', 'secondary'); echo '</form>';
        echo '<table class="widefat striped"><thead><tr><th>ID</th><th>Status</th><th>Attempts</th><th>Created (UTC)</th><th>Delivery note</th><th>Recovery</th></tr></thead><tbody>';
        foreach ($wpdb->get_results('SELECT id, status, attempts, created_at, last_error FROM ' . self::table() . ' ORDER BY id DESC LIMIT 30') as $job) {
            echo '<tr><td>' . (int) $job->id . '</td><td>' . esc_html($job->status) . '</td><td>' . (int) $job->attempts . '</td><td>' . esc_html($job->created_at) . '</td><td>' . esc_html($job->last_error) . '</td><td>';
            if ($job->status === 'FAILED') { echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="cgflight_crm_retry"><input type="hidden" name="job_id" value="' . (int) $job->id . '">'; wp_nonce_field('cgflight_retry_' . $job->id); echo '<button class="button">Retry saved delivery</button></form>'; }
            echo '</td></tr>';
        }
        echo '</tbody></table></div>';
    }
}
CGFlight_CRM_Connector::init();
register_activation_hook(__FILE__, array('CGFlight_CRM_Connector', 'activate'));
register_deactivation_hook(__FILE__, array('CGFlight_CRM_Connector', 'deactivate'));
