/** @odoo-module **/

import {registerPatch} from "@mail/model/model_core";

registerPatch({
    name: "MessagingNotificationHandler",
    recordMethods: {
        async _handleNotificationChannelMessage(payload) {
            const result = await this._super(payload);
            // Play notification sound for gateway channel messages when browser is focused
            const channel = this.messaging.models["Channel"].findFromIdentifyingData({
                id: payload.id,
            });
            if (
                channel &&
                channel.channel_type === "gateway" &&
                this.env.services["presence"].isOdooFocused()
            ) {
                const messageData = this.messaging.models["Message"].convertData(
                    payload.message
                );
                const message = this.messaging.models["Message"].findFromIdentifyingData({
                    id: messageData.id,
                });
                if (message && message.author !== this.messaging.currentPartner) {
                    this.messaging.soundEffects.newMessage.play();
                }
            }
            return result;
        },
    },
});
