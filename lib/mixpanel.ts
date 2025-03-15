import mixpanel from 'mixpanel-browser';

// Initialize Mixpanel with your project token
// Replace YOUR_MIXPANEL_TOKEN with your actual Mixpanel token
const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN || 'YOUR_MIXPANEL_TOKEN';

// Initialize once
if (typeof window !== 'undefined') {
  mixpanel.init(MIXPANEL_TOKEN, {
    debug: process.env.NODE_ENV !== 'production',
    track_pageview: true,
    persistence: 'localStorage'
  });
}

// Wrapper for Mixpanel tracking functions
const MixpanelTracking = {
  /**
   * Identify a user with a unique ID
   * @param userId - Unique identifier for the user (email)
   * @param userProperties - Additional user properties to set
   */
  identify: (userId: string, userProperties: Record<string, any> = {}) => {
    mixpanel.identify(userId);
    mixpanel.people.set(userProperties);
  },
  
  /**
   * Track an event
   * @param eventName - Name of the event
   * @param properties - Properties to include with the event
   */
  track: (eventName: string, properties: Record<string, any> = {}) => {
    mixpanel.track(eventName, properties);
  },
  
  /**
   * Track a page view
   * @param pageName - Name of the page
   * @param properties - Additional properties
   */
  trackPageView: (pageName: string, properties: Record<string, any> = {}) => {
    mixpanel.track('Page View', {
      'Page Name': pageName,
      ...properties
    });
  },
  
  /**
   * Reset the user's identity and clear associated data
   */
  reset: () => {
    mixpanel.reset();
  }
};

export default MixpanelTracking;
