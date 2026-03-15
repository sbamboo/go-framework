/* General JS shared across all pages - Node Graphs of PartialDataClasses */


// File containing reusable code for popups

//MARK: TODO: Take elements instead of elementId? And add check if element has no parents just append to container isntead of cloning
//MARK: TODO: Add getElementOfPortal and getElementOfOverlay methods to get the actual element in the container (if cloned, or moved etc.)

// Click handler for clickOutside must be assigned to document, because the overlay-container, popup-container and portal-container should be able to be clicked through and translucent
window.addedGlobalEventListener = false;

class Popups {
    constructor() {
        // If DOM has not loaded schedule constructor to run on DOMContentLoaded
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => this.init());
            return;
        }
        
        this.init();
    }

    init() {
        // Get containers
        this.overlayContainer = document.getElementById("overlay-container");
        this.popupContainer = document.getElementById("popup-container");
        this.portalContainer = document.getElementById("portal-container");

        this.shownPopups = []; // Stores elements
        this.shownPortals = []; // Stores elements
        this.ignoreNextClick = false; // Flag to prevent immediate closing

        // Set up global click handler for click outside functionality
        if (!window.addedGlobalEventListener) {
            document.addEventListener("click", (e) => this.handleDocumentClick(e));
            window.addedGlobalEventListener = true;
        }   
    }

    // Handle document clicks for click outside functionality
    handleDocumentClick(e) {
        // If we should ignore this click, reset the flag and return
        if (this.ignoreNextClick) {
            this.ignoreNextClick = false;
            return;
        }

        // Check overlays for click outside
        this.shownPopups.forEach(popup => {
            if (popup.dataset.closeOnClickOutside === "true") {
                if (!popup.contains(e.target)) {
                    this.hideAsOverlay(popup.id);
                }
            }
        });

        // Check portals for click outside
        this.shownPortals.forEach(portal => {
            if (portal.dataset.closeOnClickOutside === "true") {
                if (!portal.contains(e.target)) {
                    this.hideAsPortal(portal.id);
                }
            }
        });
    }

    // Show a overlay popup (A popup that is above all content and centered on the screen)
    showAsOverlay(elementId, closeOnClickOutside = false, closeOnMouseOut = false, darkenBackground = true, clickThroughBackground = false) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error(`Element with id "${elementId}" not found`);
            return;
        }

        // Set flag to ignore the next click if closeOnClickOutside is enabled
        if (closeOnClickOutside) {
            this.ignoreNextClick = true;
        }

        let popupElement;

        // Check if element is already in overlay container or is a descendant
        if (this.popupContainer.contains(element)) {
            popupElement = element;
        } else {
            // Clone element and append to overlay container
            popupElement = element.cloneNode(true);
            this.popupContainer.appendChild(popupElement);
        }

        // Add data attributes for close options
        popupElement.dataset.closeOnClickOutside = closeOnClickOutside.toString();
        popupElement.dataset.closeOnMouseOut = closeOnMouseOut.toString();
        popupElement.dataset.darkenBackground = darkenBackground.toString();
        popupElement.dataset.dontClickThroughBackground = (!clickThroughBackground).toString();

        // If this child should darken background, add class to container
        if (darkenBackground) {
            this.popupContainer.classList.add("popup-container-darken-background");
        }

        // If this child should allow click through background, add class to container
        if (!clickThroughBackground) {
            this.popupContainer.classList.add("popup-container-dont-click-through-background");
        }

        // Show the popup
        popupElement.style.display = "flex";
        this.popupContainer.style.display = "flex";

        // Add to shown popups array if not already there
        if (!this.shownPopups.includes(popupElement)) {
            this.shownPopups.push(popupElement);
        }

        // If closeOnMouseOut is true, add mouseout listener
        if (closeOnMouseOut) {
            const mouseOutHandler = (e) => {
                // Check if mouse is moving to a child element
                if (!popupElement.contains(e.relatedTarget)) {
                    this.hideAsOverlay(elementId);
                    popupElement.removeEventListener("mouseleave", mouseOutHandler);
                }
            };
            popupElement.addEventListener("mouseleave", mouseOutHandler);
        }
    }

    // Hide a overlay popup
    hideAsOverlay(elementId) {
        const popupElement = this.popupContainer.querySelector(`#${elementId}`);
        if (!popupElement) return;

        // Hide the popup
        popupElement.style.display = "none";

        // Remove from shown popups array
        const index = this.shownPopups.indexOf(popupElement);
        if (index > -1) {
            this.shownPopups.splice(index, 1);
        }

        // If no children want to darkenBackground anymore remove class from container
        const anyDarken = this.shownPopups.some(popup => popup.dataset.darkenBackground === "true");
        if (!anyDarken) {
            this.popupContainer.classList.remove("popup-container-darken-background");
        }

        // If no children want to clickThroughBackground anymore remove class from container
        const anyDontClickThroughAndVisible = this.shownPopups.some(popup => popup.dataset.dontClickThroughBackground === "true" && popup.style.display !== "none");
        if (!anyDontClickThroughAndVisible) {
            this.popupContainer.classList.remove("popup-container-dont-click-through-background");
        }

        // If no more popups are shown, hide the overlay container
        if (this.shownPopups.length === 0) {
            this.popupContainer.style.display = "none";
        }

        // Remove cloned element if it was cloned
        const originalElement = document.getElementById(elementId);
        if (originalElement && originalElement !== popupElement) {
            popupElement.remove();
        }
    }

    // Hide all overlay popups
    hideAllOverlays() {
        // Reverse iterate to avoid child issues
        for (let i = this.shownPopups.length - 1; i >= 0; i--) {
            const popup = this.shownPopups[i];
            this.hideAsOverlay(popup.id);
        }
    }

    // Show a portal popup (A popup that is placed at a location, like a right click menu, or a tooltip)
    showAsPortal(elementId, x, y, originY = "top", originX = "left", nudgeOnScreen = true, closeOnClickOutside = true, closeOnMouseOut = true) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error(`Element with id "${elementId}" not found`);
            return;
        }

        // Set flag to ignore the next click if closeOnClickOutside is enabled
        if (closeOnClickOutside) {
            this.ignoreNextClick = true;
        }

        let portalElement;

        // Check if element is already in portal container or is a descendant
        if (this.portalContainer.contains(element)) {
            portalElement = element;
        } else {
            // Clone element and append to portal container
            portalElement = element.cloneNode(true);
            this.portalContainer.appendChild(portalElement);
        }

        // Add data attributes for close options
        portalElement.dataset.closeOnClickOutside = closeOnClickOutside.toString();
        portalElement.dataset.closeOnMouseOut = closeOnMouseOut.toString();

        // Show the portal
        portalElement.style.display = "flex";
        portalElement.style.position = "absolute";

        // Calculate position based on origin
        let finalX = x;
        let finalY = y;

        // Get element dimensions for positioning
        const rect = portalElement.getBoundingClientRect();
        const elementWidth = rect.width || portalElement.offsetWidth;
        const elementHeight = rect.height || portalElement.offsetHeight;

        // Adjust position based on origin
        switch (originX) {
            case "center":
                finalX = x - elementWidth / 2;
                break;
            case "right":
                finalX = x - elementWidth;
                break;
            // "left" is default, no adjustment needed
        }

        switch (originY) {
            case "center":
                finalY = y - elementHeight / 2;
                break;
            case "bottom":
                finalY = y - elementHeight;
                break;
            // "top" is default, no adjustment needed
        }

        // Nudge on screen if requested
        if (nudgeOnScreen) {
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Adjust horizontal position
            if (finalX < 0) {
                finalX = 0;
            } else if (finalX + elementWidth > viewportWidth) {
                finalX = viewportWidth - elementWidth;
            }

            // Adjust vertical position
            if (finalY < 0) {
                finalY = 0;
            } else if (finalY + elementHeight > viewportHeight) {
                finalY = viewportHeight - elementHeight;
            }
        }

        // Set final position
        portalElement.style.left = finalX + "px";
        portalElement.style.top = finalY + "px";

        // Add to shown portals array if not already there
        if (!this.shownPortals.includes(portalElement)) {
            this.shownPortals.push(portalElement);
        }

        // If closeOnMouseOut is true, add mouseout listener
        if (closeOnMouseOut) {
            const mouseOutHandler = (e) => {
                // Check if mouse is moving to a child element
                if (!portalElement.contains(e.relatedTarget)) {
                    this.hideAsPortal(elementId);
                    portalElement.removeEventListener("mouseleave", mouseOutHandler);
                }
            };
            portalElement.addEventListener("mouseleave", mouseOutHandler);
        }
    }

    // Hide a portal popup
    hideAsPortal(elementId) {
        const portalElement = this.portalContainer.querySelector(`#${elementId}`);
        if (!portalElement) return;

        // Hide the portal
        portalElement.style.display = "none";

        // Remove from shown portals array
        const index = this.shownPortals.indexOf(portalElement);
        if (index > -1) {
            this.shownPortals.splice(index, 1);
        }

        // Remove cloned element if it was cloned
        const originalElement = document.getElementById(elementId);
        if (originalElement && originalElement !== portalElement) {
            portalElement.remove();
        }
    }

    // Hide all portal popups
    hideAllPortals() {
        // Reverse iterate to avoid child issues
        for (let i = this.shownPortals.length - 1; i >= 0; i--) {
            const portal = this.shownPortals[i];
            this.hideAsPortal(portal.id);
        }
    }
}