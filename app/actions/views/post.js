// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {batchActions} from 'redux-batched-actions';

import {UserTypes} from 'mattermost-redux/action_types';
import {
    doPostAction,
    getNeededAtMentionedUsernames,
    receivedNewPost,
    receivedPosts,
    receivedPostsInChannel,
    receivedPostsSince,
} from 'mattermost-redux/actions/posts';
import {Client4} from 'mattermost-redux/client';
import {Posts} from 'mattermost-redux/constants';
import {removeUserFromList} from 'mattermost-redux/utils/user_utils';

import {ViewTypes} from 'app/constants';
import {generateId} from 'app/utils/file';

import {getEmojisInPosts} from './emoji';

export function sendAddToChannelEphemeralPost(user, addedUsername, message, channelId, postRootId = '') {
    return async (dispatch) => {
        const timestamp = Date.now();
        const post = {
            id: generateId(),
            user_id: user.id,
            channel_id: channelId,
            message,
            type: Posts.POST_TYPES.EPHEMERAL_ADD_TO_CHANNEL,
            create_at: timestamp,
            update_at: timestamp,
            root_id: postRootId,
            parent_id: postRootId,
            props: {
                username: user.username,
                addedUsername,
            },
        };

        dispatch(receivedNewPost(post));
    };
}

export function setAutocompleteSelector(dataSource, onSelect, options) {
    return {
        type: ViewTypes.SELECTED_ACTION_MENU,
        data: {
            dataSource,
            onSelect,
            options,
        },
    };
}

export function selectAttachmentMenuAction(postId, actionId, text, value) {
    return (dispatch) => {
        dispatch({
            type: ViewTypes.SUBMIT_ATTACHMENT_MENU_ACTION,
            postId,
            data: {
                [actionId]: {
                    text,
                    value,
                },
            },
        });

        dispatch(doPostAction(postId, actionId, value));
    };
}

export function getPosts(channelId, page = 0, perPage = Posts.POST_CHUNK_SIZE) {
    return async (dispatch) => {
        try {
            const data = await Client4.getPosts(channelId, page, perPage);
            const posts = Object.values(data.posts);

            if (posts?.length) {
                const actions = [
                    receivedPosts(data),
                    receivedPostsInChannel(data, channelId, page === 0, data.prev_post_id === ''),
                ];

                const additional = await dispatch(getPostsAdditionalDataBatch(posts));
                if (additional.length) {
                    actions.push(...additional);
                }

                dispatch(batchActions(actions));
            }

            return {data};
        } catch (error) {
            return {error};
        }
    };
}

export function getPostsSince(channelId, since) {
    return async (dispatch) => {
        try {
            const data = await Client4.getPostsSince(channelId, since);
            const posts = Object.values(data.posts);

            if (posts?.length) {
                const actions = [
                    receivedPosts(data),
                    receivedPostsSince(data, channelId),
                ];

                const additional = await dispatch(getPostsAdditionalDataBatch(posts));
                if (additional.length) {
                    actions.push(...additional);
                }

                dispatch(batchActions(actions));
            }

            return {data};
        } catch (error) {
            return {error};
        }
    };
}

function getPostsAdditionalDataBatch(posts = []) {
    return async (dispatch, getState) => {
        const actions = [];

        if (!posts.length) {
            return actions;
        }

        // Custom Emojis used in the posts
        // Do not wait for this as they need to be loaded one by one
        dispatch(getEmojisInPosts(posts));

        try {
            const state = getState();
            const promises = [];
            const promiseTrace = [];
            const extra = dispatch(profilesStatusesAndToLoadFromPosts(posts));

            if (extra?.userIds.length) {
                promises.push(Client4.getProfilesByIds(extra.userIds));
                promiseTrace.push('ids');
            }

            if (extra?.usernames.length) {
                promises.push(Client4.getProfilesByUsernames(extra.usernames));
                promiseTrace.push('usernames');
            }

            if (extra?.statuses.length) {
                promises.push(Client4.getStatusesByIds(extra.statuses));
                promiseTrace.push('statuses');
            }

            if (promises.length) {
                const result = await Promise.all(promises);
                result.forEach((p, index) => {
                    if (p.length) {
                        const type = promiseTrace[index];
                        switch (type) {
                        case 'statuses':
                            actions.push({
                                type: UserTypes.RECEIVED_STATUSES,
                                data: p,
                            });
                            break;
                        default: {
                            const {currentUserId} = state.entities.users;

                            removeUserFromList(currentUserId, p);
                            actions.push({
                                type: UserTypes.RECEIVED_PROFILES_LIST,
                                data: p,
                            });
                            break;
                        }
                        }
                    }
                });
            }
        } catch (error) {
            // do nothing
        }

        return actions;
    };
}

function profilesStatusesAndToLoadFromPosts(posts = []) {
    return (dispatch, getState) => {
        const state = getState();
        const {currentUserId, profiles, statuses} = state.entities.users;

        // Profiles of users mentioned in the posts
        const usernamesToLoad = getNeededAtMentionedUsernames(state, posts);

        // Statuses and profiles of the users who made the posts
        const userIdsToLoad = new Set();
        const statusesToLoad = new Set();

        posts.forEach((post) => {
            const userId = post.user_id;

            if (!statuses[userId]) {
                statusesToLoad.add(userId);
            }

            if (userId === currentUserId) {
                return;
            }

            if (!profiles[userId]) {
                userIdsToLoad.add(userId);
            }
        });

        return {
            usernames: Array.from(usernamesToLoad),
            userIds: Array.from(userIdsToLoad),
            statuses: Array.from(statusesToLoad),
        };
    };
}