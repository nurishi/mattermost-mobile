// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {PureComponent} from 'react';
import PropTypes from 'prop-types';
import {
    Image,
    Linking,
    Text,
    View,
} from 'react-native';

import {TABLET_WIDTH} from 'app/components/sidebars/drawer_layout';
import TouchableWithFeedback from 'app/components/touchable_with_feedback';
import {DeviceTypes} from 'app/constants';

import {previewImageAtIndex, calculateDimensions} from 'app/utils/images';
import {getNearestPoint} from 'app/utils/opengraph';
import {changeOpacity, makeStyleSheetFromTheme} from 'app/utils/theme';

const MAX_IMAGE_HEIGHT = 150;
const VIEWPORT_IMAGE_OFFSET = 93;
const VIEWPORT_IMAGE_REPLY_OFFSET = 13;

export default class PostAttachmentOpenGraph extends PureComponent {
    static propTypes = {
        actions: PropTypes.shape({
            getOpenGraphMetadata: PropTypes.func.isRequired,
        }).isRequired,
        deviceHeight: PropTypes.number.isRequired,
        deviceWidth: PropTypes.number.isRequired,
        imagesMetadata: PropTypes.object,
        isReplyPost: PropTypes.bool,
        link: PropTypes.string.isRequired,
        openGraphData: PropTypes.object,
        theme: PropTypes.object.isRequired,
    };

    constructor(props) {
        super(props);

        this.state = this.getBestImageUrl(props.openGraphData);
    }

    componentDidMount() {
        this.mounted = true;

        this.fetchData(this.props.link, this.props.openGraphData);

        if (this.state.openGraphImageUrl) {
            this.getImageSize(this.state.openGraphImageUrl);
        }
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.link !== this.props.link) {
            this.setState({hasImage: false});
            this.fetchData(nextProps.link, nextProps.openGraphData);
        }

        if (this.props.openGraphData !== nextProps.openGraphData) {
            this.setState(this.getBestImageUrl(nextProps.openGraphData), () => {
                this.getImageSize(this.state.openGraphImageUrl);
            });
        }
    }

    componentWillUnmount() {
        this.mounted = false;
    }

    setItemRef = (ref) => {
        this.itemRef = ref;
    }

    fetchData = (url, openGraphData) => {
        if (!openGraphData) {
            this.props.actions.getOpenGraphMetadata(url);
        }
    };

    getBestImageUrl = (data) => {
        if (!data || !data.images) {
            return {
                hasImage: false,
            };
        }

        const {imagesMetadata} = this.props;
        const bestDimensions = {
            width: this.getViewPostWidth(),
            height: MAX_IMAGE_HEIGHT,
        };

        const bestImage = getNearestPoint(bestDimensions, data.images, 'width', 'height');
        const imageUrl = bestImage.secure_url || bestImage.url;

        let ogImage;
        if (imagesMetadata && imagesMetadata[imageUrl]) {
            ogImage = imagesMetadata[imageUrl];
        }

        if (!ogImage) {
            ogImage = data.images.find((i) => i.url === imageUrl || i.secure_url === imageUrl);
        }

        // Fallback when the ogImage does not have dimensions but there is a metaImage defined
        const metaImages = imagesMetadata ? Object.values(imagesMetadata) : null;
        if ((!ogImage?.width || !ogImage?.height) && metaImages?.length) {
            ogImage = metaImages[0];
        }

        let dimensions = bestDimensions;
        if (ogImage?.width && ogImage?.height) {
            dimensions = calculateDimensions(ogImage.height, ogImage.width, this.getViewPostWidth());
        }

        return {
            hasImage: true,
            ...dimensions,
            openGraphImageUrl: imageUrl,
        };
    };

    getFilename = (link) => {
        let filename = link.substring(link.lastIndexOf('/') + 1, link.indexOf('?') === -1 ? link.length : link.indexOf('?'));
        const extension = filename.split('.').pop();

        if (extension === filename) {
            const ext = filename.indexOf('.') === -1 ? '.png' : filename.substring(filename.lastIndexOf('.'));
            filename = `${filename}${ext}`;
        }

        return `og-${filename.replace(/:/g, '-')}`;
    };

    getImageSize = (imageUrl) => {
        const {imagesMetadata, openGraphData} = this.props;
        const {openGraphImageUrl} = this.state;

        let ogImage;
        if (imagesMetadata && imagesMetadata[openGraphImageUrl]) {
            ogImage = imagesMetadata[openGraphImageUrl];
        }

        if (!ogImage) {
            ogImage = openGraphData?.images?.find((i) => i.url === openGraphImageUrl || i.secure_url === openGraphImageUrl);
        }

        // Fallback when the ogImage does not have dimensions but there is a metaImage defined
        const metaImages = imagesMetadata ? Object.values(imagesMetadata) : null;
        if ((!ogImage?.width || !ogImage?.height) && metaImages?.length) {
            ogImage = metaImages[0];
        }

        if (ogImage?.width && ogImage?.height) {
            this.setImageSize(imageUrl, ogImage.width, ogImage.height);
        } else {
            // if we get to this point there can be a scroll pop
            Image.getSize(imageUrl, (width, height) => {
                this.setImageSize(imageUrl, width, height);
            }, () => null);
        }
    };

    setImageSize = (imageUrl, originalWidth, originalHeight) => {
        if (this.mounted) {
            const dimensions = calculateDimensions(originalHeight, originalWidth, this.getViewPostWidth());

            this.setState({
                imageUrl,
                originalWidth,
                originalHeight,
                ...dimensions,
            });
        }
    };

    getViewPostWidth = () => {
        const {deviceHeight, deviceWidth, isReplyPost} = this.props;
        const deviceSize = deviceWidth > deviceHeight ? deviceHeight : deviceWidth;
        const viewPortWidth = deviceSize - VIEWPORT_IMAGE_OFFSET - (isReplyPost ? VIEWPORT_IMAGE_REPLY_OFFSET : 0);
        const tabletOffset = DeviceTypes.IS_TABLET ? TABLET_WIDTH : 0;

        return viewPortWidth - tabletOffset;
    };

    goToLink = () => {
        Linking.openURL(this.props.link);
    };

    handlePreviewImage = () => {
        const {
            imageUrl: uri,
            openGraphImageUrl: link,
            originalWidth,
            originalHeight,
        } = this.state;
        const filename = this.getFilename(link);

        const files = [{
            caption: filename,
            dimensions: {
                width: originalWidth,
                height: originalHeight,
            },
            source: {uri},
            data: {
                localPath: uri,
            },
        }];

        previewImageAtIndex([this.itemRef], 0, files);
    };

    renderDescription = () => {
        const {openGraphData} = this.props;
        if (!openGraphData.description) {
            return null;
        }

        const style = getStyleSheet(this.props.theme);

        return (
            <View style={style.flex}>
                <Text
                    style={style.siteDescription}
                    numberOfLines={5}
                    ellipsizeMode='tail'
                >
                    {openGraphData.description}
                </Text>
            </View>
        );
    };

    renderImage = () => {
        if (!this.state.hasImage) {
            return null;
        }

        const {height, imageUrl, width} = this.state;

        let source;
        if (imageUrl) {
            source = {
                uri: imageUrl,
            };
        }

        const style = getStyleSheet(this.props.theme);

        return (
            <View
                ref={this.setItemRef}
                style={[style.imageContainer, {width, height}]}
            >
                <TouchableWithFeedback
                    onPress={this.handlePreviewImage}
                    type={'none'}
                >
                    <Image
                        style={[style.image, {width, height}]}
                        source={source}
                        resizeMode='contain'
                    />
                </TouchableWithFeedback>
            </View>
        );
    };

    render() {
        const {
            isReplyPost,
            link,
            openGraphData,
            theme,
        } = this.props;

        const style = getStyleSheet(theme);

        if (!openGraphData) {
            return null;
        }

        let siteName;
        if (openGraphData.site_name) {
            siteName = (
                <View style={style.flex}>
                    <Text
                        style={style.siteTitle}
                        numberOfLines={1}
                        ellipsizeMode='tail'
                    >
                        {openGraphData.site_name}
                    </Text>
                </View>
            );
        }

        const title = openGraphData.title || openGraphData.url || link;
        let siteTitle;
        if (title) {
            siteTitle = (
                <View style={style.wrapper}>
                    <TouchableWithFeedback
                        style={style.flex}
                        onPress={this.goToLink}
                        type={'opacity'}
                    >
                        <Text
                            style={[style.siteSubtitle, {marginRight: isReplyPost ? 10 : 0}]}
                            numberOfLines={3}
                            ellipsizeMode='tail'
                        >
                            {title}
                        </Text>
                    </TouchableWithFeedback>
                </View>
            );
        }

        return (
            <View style={style.container}>
                {siteName}
                {siteTitle}
                {this.renderDescription()}
                {this.renderImage()}
            </View>
        );
    }
}

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    return {
        container: {
            flex: 1,
            borderColor: changeOpacity(theme.centerChannelColor, 0.2),
            borderWidth: 1,
            borderRadius: 3,
            marginTop: 10,
            padding: 10,
        },
        flex: {
            flex: 1,
        },
        wrapper: {
            flex: 1,
            flexDirection: 'row',
        },
        siteTitle: {
            fontSize: 12,
            color: changeOpacity(theme.centerChannelColor, 0.5),
            marginBottom: 10,
        },
        siteSubtitle: {
            fontSize: 14,
            color: theme.linkColor,
            marginBottom: 10,
        },
        siteDescription: {
            fontSize: 13,
            color: changeOpacity(theme.centerChannelColor, 0.7),
            marginBottom: 10,
        },
        imageContainer: {
            alignItems: 'center',
            borderColor: changeOpacity(theme.centerChannelColor, 0.2),
            borderWidth: 1,
            borderRadius: 3,
            marginTop: 5,
        },
        image: {
            borderRadius: 3,
        },
    };
});
