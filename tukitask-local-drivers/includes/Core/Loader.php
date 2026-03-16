<?php
/**
 * Hook Loader for WordPress actions and filters.
 *
 * @package Tukitask\LocalDrivers\Core
 */

namespace Tukitask\LocalDrivers\Core;

/**
 * Loader Class.
 *
 * Manages registration of WordPress actions and filters.
 * Provides a centralized way to register hooks from all components.
 */
class Loader {

	/**
	 * Array of actions to register.
	 *
	 * @var array
	 */
	protected $actions = array();

	/**
	 * Array of filters to register.
	 *
	 * @var array
	 */
	protected $filters = array();

	/**
	 * Array of shortcodes to register.
	 *
	 * @var array
	 */
	protected $shortcodes = array();

	/**
	 * Add an action to the collection.
	 *
	 * @param string $hook          The name of the WordPress action.
	 * @param object $component     The object instance.
	 * @param string $callback      The callback method name.
	 * @param int    $priority      Optional. Hook priority. Default 10.
	 * @param int    $accepted_args Optional. Number of arguments. Default 1.
	 */
	public function add_action( $hook, $component, $callback, $priority = 10, $accepted_args = 1 ) {
		$this->actions = $this->add( $this->actions, $hook, $component, $callback, $priority, $accepted_args );
	}

	/**
	 * Add a filter to the collection.
	 *
	 * @param string $hook          The name of the WordPress filter.
	 * @param object $component     The object instance.
	 * @param string $callback      The callback method name.
	 * @param int    $priority      Optional. Hook priority. Default 10.
	 * @param int    $accepted_args Optional. Number of arguments. Default 1.
	 */
	public function add_filter( $hook, $component, $callback, $priority = 10, $accepted_args = 1 ) {
		$this->filters = $this->add( $this->filters, $hook, $component, $callback, $priority, $accepted_args );
	}

	/**
	 * Add a shortcode to the collection.
	 *
	 * @param string $tag       The shortcode tag.
	 * @param object $component The object instance.
	 * @param string $callback  The callback method name.
	 */
	public function add_shortcode( $tag, $component, $callback ) {
		$this->shortcodes[] = array(
			'tag'       => $tag,
			'component' => $component,
			'callback'  => $callback,
		);
	}

	/**
	 * Utility method to add hooks to the collection.
	 *
	 * @param array  $hooks         The collection of hooks.
	 * @param string $hook          The name of the WordPress hook.
	 * @param object $component     The object instance.
	 * @param string $callback      The callback method name.
	 * @param int    $priority      Hook priority.
	 * @param int    $accepted_args Number of arguments.
	 * @return array Updated hooks collection.
	 */
	private function add( $hooks, $hook, $component, $callback, $priority, $accepted_args ) {
		$hooks[] = array(
			'hook'          => $hook,
			'component'     => $component,
			'callback'      => $callback,
			'priority'      => $priority,
			'accepted_args' => $accepted_args,
		);
		return $hooks;
	}

	/**
	 * Register all hooks with WordPress.
	 *
	 * Loops through filters and actions and registers them.
	 */
	public function run() {
		foreach ( $this->filters as $hook ) {
			add_filter(
				$hook['hook'],
				array( $hook['component'], $hook['callback'] ),
				$hook['priority'],
				$hook['accepted_args']
			);
		}

		foreach ( $this->actions as $hook ) {
			add_action(
				$hook['hook'],
				array( $hook['component'], $hook['callback'] ),
				$hook['priority'],
				$hook['accepted_args']
			);
		}

		foreach ( $this->shortcodes as $shortcode ) {
			add_shortcode(
				$shortcode['tag'],
				array( $shortcode['component'], $shortcode['callback'] )
			);
		}
	}
}
