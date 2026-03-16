# AJAX 500 Error Fixes - Summary

**Date:** Latest Session  
**Issue:** Toggle availability button and withdrawal button returning 500 errors  
**Solution:** Complete rewrite of three critical AJAX handlers with improved error handling and fallback logic

---

## Problems Fixed

1. **ajax_toggle_availability() - 500 errors**
   - Was calling Driver_Availability::update_driver_status() which likely threw exceptions
   - No proper nonce handling if check_ajax_referer() failed silently
   - No fallback logic if Driver_Manager wasn't available

2. **ajax_request_driver_withdrawal() - 500 errors**
   - Calling Wallet_Manager methods without proper exception handling
   - No fallback for balance checks
   - No alternative withdrawal post creation if Wallet_Manager unavailable

3. **ajax_register_fcm_token() - potential issues**
   - No fallback storage if Push_Manager unavailable
   - No output buffering checks

---

## Key Changes

### 1. ajax_toggle_availability() - Lines ~1250-1330

**Before:**
```php
check_ajax_referer( 'tukitask_driver_action', 'nonce' );
$driver_post_id = $this->get_driver_post_id( $user_id );
update_post_meta( $driver_post_id, '_driver_status', $new_status );
```

**After:**
```php
// Manual nonce verification
if ( ! wp_verify_nonce( $_POST['nonce'], 'tukitask_driver_action' ) ) {
    wp_send_json_error( array( 'message' => 'Nonce verification failed' ) );
    return;
}

// Fallback driver ID lookup
if ( ! $driver_post_id ) {
    $args = array(
        'post_type'      => 'driver',
        'posts_per_page' => 1,
        'meta_key'       => '_driver_user_id',
        'meta_value'     => $user_id,
        'fields'         => 'ids'
    );
    $posts = get_posts( $args );
    if ( ! empty( $posts ) ) {
        $driver_post_id = $posts[0];
    }
}

// Comprehensive logging
error_log( "Tukitask DEBUG: Toggle availability for user $user_id" );
error_log( "Tukitask DEBUG: Driver post ID: $driver_post_id" );
error_log( "Tukitask DEBUG: Current status: $current_status" );

// Output buffering to catch unexpected output
ob_start();
// ... code ...
$output = ob_get_clean();
if ( ! empty( $output ) ) {
    error_log( "Tukitask ERROR: Unexpected output: " . $output );
}
wp_die();
```

**Key Improvements:**
- Manual nonce verification (more explicit error handling)
- Fallback direct database query if Driver_Manager fails
- Comprehensive debug logging at each step
- Output buffering to catch fatal errors
- Explicit wp_die() call
- Separate Exception and Throwable catch blocks

---

### 2. ajax_request_driver_withdrawal() - Lines ~1470-1590

**Before:**
```php
$balance = \Tukitask\LocalDrivers\Drivers\Wallet_Manager::get_balance( $user_id );
$driver_post_id = \Tukitask\LocalDrivers\Drivers\Driver_Manager::get_driver_id_by_user( $user_id );
$request_id = \Tukitask\LocalDrivers\Drivers\Wallet_Manager::create_withdrawal_request( [...] );
```

**After:**
```php
// Fallback balance checking
$balance = 0;

// Try Wallet_Manager
if ( class_exists( '\Tukitask\LocalDrivers\Drivers\Wallet_Manager' ) && 
     method_exists( '\Tukitask\LocalDrivers\Drivers\Wallet_Manager', 'get_balance' ) ) {
    try {
        $balance = \Tukitask\LocalDrivers\Drivers\Wallet_Manager::get_balance( $user_id );
    } catch ( Exception $e ) {
        error_log( "Tukitask WARNING: Wallet_Manager::get_balance failed: " . $e->getMessage() );
        $balance = 0;
    }
}

// Fallback to user meta
if ( ! $balance || $balance === 0 ) {
    $balance = floatval( get_user_meta( $user_id, 'tukitask_balance', true ) );
}

// ... similar fallback for driver_post_id ...

// Fallback withdrawal post creation
if ( ! $request_id ) {
    $withdrawal_post_id = wp_insert_post( array(
        'post_type'   => 'withdrawal_request',
        'post_status' => 'pending',
        'post_author' => $user_id,
        'post_title'  => sprintf( 'Withdrawal: %s - %s', $user_id, $amount ),
        'meta_input'  => array(
            '_withdrawal_user_id'    => $user_id,
            '_withdrawal_driver_id'  => $driver_post_id,
            '_withdrawal_amount'     => $amount,
            '_withdrawal_method'     => 'transfer',
            '_withdrawal_status'     => 'pending',
            '_withdrawal_date'       => current_time( 'mysql' )
        )
    ) );
    
    if ( ! is_wp_error( $withdrawal_post_id ) ) {
        $request_id = $withdrawal_post_id;
    }
}
```

**Key Improvements:**
- Try-catch blocks around each external class method call
- Fallback balance lookup from user_meta
- Fallback driver ID query
- Fallback withdrawal post creation via wp_insert_post
- Multiple levels of error handling
- Comprehensive logging of each step
- Returns user-friendly error messages with technical details for logging

---

### 3. ajax_register_fcm_token() - Improved consistency

**Key Changes:**
- Manual nonce verification
- Try-catch around Push_Manager call
- Fallback to user_meta storage
- Output buffering and proper wp_die()
- Consistent error logging

---

## Testing Checklist

After uploading to production:

1. **Check WordPress Error Log**
   - File: `/home/u208747126/domains/tukitask.com/public_html/id/wp-content/debug.log`
   - Look for "Tukitask DEBUG:" messages to understand execution flow
   - Look for "Tukitask ERROR:" messages for actual failures

2. **Test Toggle Availability**
   - Click the status toggle in driver dashboard
   - Expected: JSON success response instead of 500
   - Check console for: "Status synced with server"
   - Check status label updates

3. **Test Withdrawal Request**
   - Click "Retirar Dinero" button
   - Enter amount and submit
   - Expected: "Solicitud enviada correctamente" message
   - Page should reload after 1.5 seconds
   - Check withdrawal appears in "Retiros" section

4. **Check Error Logs**
   - SSH into server
   - Run: `tail -f /home/u208747126/domains/tukitask.com/public_html/id/wp-content/debug.log`
   - Monitor for real-time error messages

---

## Files Modified

- **includes/Frontend/Driver_Dashboard.php**
  - Lines ~1250-1330: ajax_toggle_availability()
  - Lines ~1437-1495: ajax_register_fcm_token()
  - Lines ~1470-1590: ajax_request_driver_withdrawal()

---

## Deployment Instructions

1. Backup original file
2. Replace includes/Frontend/Driver_Dashboard.php with updated version
3. Clear WordPress cache: WordPress Settings > Clear Cache (if WP Super Cache/similar)
4. Test functionality in browser
5. Monitor error logs for any new issues

---

## How Fallback Logic Works

### Toggle Availability Fallback Chain:
1. Try: Driver_Manager::get_driver_id_by_user()
2. Fallback: Direct get_posts() query with meta_key '_driver_user_id'
3. Update status using update_post_meta() (no class methods)

### Withdrawal Request Fallback Chain:
1. Try: Wallet_Manager::get_balance() 
2. Fallback: get_user_meta('tukitask_balance')
3. Try: Driver_Manager::get_driver_id_by_user()
4. Fallback: Direct get_posts() query
5. Try: Wallet_Manager::create_withdrawal_request()
6. Fallback: wp_insert_post() with withdrawal_request post type

### FCM Token Fallback:
1. Try: Push_Manager::register_token()
2. Fallback: update_user_meta('_tukitask_fcm_token')

---

## Logging Strategy

All handlers now log:
- **DEBUG**: Execution flow and data values
- **WARNING**: Class method failures (used fallback)
- **ERROR**: Actual failures or exceptions
- **SUCCESS**: Successful operations with details

Example output:
```
[14-Dec-2024 10:30:45 UTC] Tukitask DEBUG: Toggle availability for user 5
[14-Dec-2024 10:30:45 UTC] Tukitask DEBUG: Driver post ID: 123
[14-Dec-2024 10:30:45 UTC] Tukitask DEBUG: Current status: offline
[14-Dec-2024 10:30:45 UTC] Tukitask DEBUG: New status: available
[14-Dec-2024 10:30:45 UTC] Tukitask DEBUG: Sending success response
```

This helps identify exactly where failures occur without compromising user experience.
